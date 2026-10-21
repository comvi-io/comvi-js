/**
 * API Client for communicating with Translation Management System
 *
 * Endpoints (project determined by API key):
 * - GET /v1/project - Validate API key and get project info
 * - GET /v1/projects/:projectId/schema - Fetch project schema
 * - GET /v1/projects/:projectId/schema/stream - SSE for real-time schema updates
 * - GET /v1/translations - Fetch translations
 * - POST /v1/projects/:projectId/import/commit - Bulk push translations
 */

import type { EventSource } from "eventsource";
import type {
  ProjectSchema,
  ProjectInfo,
  TranslationsResponse,
  ApiTranslationsResponse,
  TranslationData,
  PushResult,
  ForceMode,
} from "../types";
import { wrapError, ErrorCodes, TypegenError } from "../utils/errors";
import { isHttpUrl } from "./apiBaseUrl";
import { DEFAULT_COMMIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "./timeouts";
import { dictionaryFrom, emptyDictionary, hasOwnKey } from "../utils/dictionary";

export interface ApiClientOptions {
  apiKey: string;
  apiBaseUrl: string;
  /** Milliseconds for each read request. */
  timeout?: number;
  /**
   * Milliseconds for the push commit, which can take minutes on a large
   * catalog. Defaults to `timeout` when that is given, else five minutes.
   */
  commitTimeout?: number;
}

export interface FetchTranslationsOptions {
  locales?: string[];
  namespaces?: string[];
}

export interface NamespaceInfo {
  id: number;
  projectId: number;
  namespace: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PushTranslationsOptions {
  translations: TranslationData;
  forceMode: Exclude<ForceMode, "ask">;
  /**
   * Remote translations already fetched by the command layer for conflict
   * prompts. Used to avoid a second API round-trip for keep/abort modes.
   */
  preloadedRemote?: TranslationsResponse;
  /**
   * Called exactly once, after the bulk commit succeeds, with
   * `completed === total` — the whole push is a single request, so there is no
   * intermediate progress to report. `total` is 0 when the payload carries no
   * translation values. A commit that fails reports nothing.
   */
  onProgress?: (progress: PushProgress) => void;
}

export interface PushProgress {
  total: number;
  completed: number;
  created: number;
  updated: number;
  skipped: number;
}

interface BulkImportResponse {
  success: boolean;
  stats: {
    keysCreated: number;
    keysUpdated: number;
    keysDeleted: number;
    translationsCreated: number;
    translationsUpdated: number;
    namespacesCreated: string[];
  };
  errors?: Array<{ key: string; namespace: string; message: string }>;
}

interface RequestJsonOptions {
  /** Retry 429/5xx/network failures. Defaults to true; the commit POST opts out. */
  retryTransient?: boolean;
  /** Prefix of a non-2xx failure message, e.g. "Failed to fetch schema". */
  failure: string;
  /** Message for a 403; without it a 403 reports like any other failure. */
  forbidden?: string;
  /** Overrides the client's read timeout for this request. */
  timeoutMs?: number;
}

/** Error bodies are read up to this many bytes; the rest is discarded. */
const ERROR_BODY_LIMIT_BYTES = 64 * 1024;
/** A platform message longer than this is cut, so one error stays one line. */
const ERROR_MESSAGE_LIMIT_CHARS = 500;

/**
 * The error a non-2xx response that will not be retried turns into. The
 * platform answers failures with `{ code, message, meta? }`; its `message` is
 * the actionable part (which keys conflict, which locale is unknown), so it is
 * read — under the caller's request timer — and appended to the status line.
 * A body that is not that JSON shape falls back to the status line alone.
 */
async function httpError(response: Response, opts: RequestJsonOptions): Promise<TypegenError> {
  if (response.status === 401) {
    await discardBody(response);
    return new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
  }
  if (response.status === 403 && opts.forbidden) {
    await discardBody(response);
    return new TypegenError(opts.forbidden, ErrorCodes.API_AUTH_FAILED);
  }

  const body = parseErrorBody(await readBoundedText(response));
  const details: Record<string, unknown> = { status: response.status, ...body };
  const statusLine = `${opts.failure}: ${response.status} ${response.statusText}`;
  const message = body.message
    ? `${statusLine}${body.code ? ` (${body.code})` : ""}: ${body.message}`
    : statusLine;
  return new TypegenError(message, ErrorCodes.API_FETCH_FAILED, undefined, details);
}

/**
 * Releases a body the client will not read. The request timer stops when the
 * attempt ends, so a server that keeps streaming would otherwise hold the
 * socket open indefinitely.
 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already closed or errored: nothing left to release.
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return typeof response.text === "function"
      ? (await response.text()).slice(0, ERROR_BODY_LIMIT_BYTES)
      : "";
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < ERROR_BODY_LIMIT_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= ERROR_BODY_LIMIT_BYTES) {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, ERROR_BODY_LIMIT_BYTES));
}

function parseErrorBody(text: string): { code?: string; message?: string; meta?: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const record = parsed as Record<string, unknown>;
  const result: { code?: string; message?: string; meta?: unknown } = {};
  const message = oneLine(record.message);
  if (message) {
    result.message = message;
  }
  const code = oneLine(record.code);
  if (code) {
    result.code = code;
  }
  if (record.meta !== undefined) {
    result.meta = record.meta;
  }
  return result;
}

/** A string field as one trimmed, bounded line; anything else is dropped. */
function oneLine(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const line = value.replace(/[\p{Cc}\s]+/gu, " ").trim();
  if (!line) {
    return undefined;
  }
  return line.length > ERROR_MESSAGE_LIMIT_CHARS
    ? `${line.slice(0, ERROR_MESSAGE_LIMIT_CHARS)}…`
    : line;
}

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_AFTER_CAP_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterValue = response.headers?.get?.("retry-after");
  if (retryAfterValue !== null && retryAfterValue !== undefined) {
    const retryAfterSeconds = Number(retryAfterValue);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1000, RETRY_AFTER_CAP_MS);
    }

    const retryAt = Date.parse(retryAfterValue);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), RETRY_AFTER_CAP_MS);
    }
  }
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

export const API_ENDPOINTS = {
  project: "/v1/project",
  translations: "/v1/translations",
  projectSchema: (projectId: number) => `/v1/projects/${projectId}/schema`,
  projectSchemaStream: (projectId: number) => `/v1/projects/${projectId}/schema/stream`,
  projectNamespaces: (projectId: number) => `/v1/projects/${projectId}/namespaces`,
  projectImportCommit: (projectId: number) => `/v1/projects/${projectId}/import/commit`,
} as const;

export class ApiClient {
  private apiKey: string;
  private apiBaseUrl: string;
  private timeout: number;
  private commitTimeout: number;
  private eventSource?: EventSource;
  private subscriptionGeneration = 0;
  private projectInfo?: ProjectInfo;
  private projectInfoPromise?: Promise<ProjectInfo>;

  constructor(options: ApiClientOptions) {
    if (!options.apiKey || typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
      throw new TypegenError(
        "API key is required and must be a non-empty string",
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    if (!options.apiBaseUrl || typeof options.apiBaseUrl !== "string") {
      throw new TypegenError(
        "API base URL is required and must be a string",
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    if (!isHttpUrl(options.apiBaseUrl)) {
      throw new TypegenError(
        `Invalid API base URL: ${options.apiBaseUrl}`,
        ErrorCodes.INVALID_INPUT,
      );
    }

    for (const timeout of [options.timeout, options.commitTimeout]) {
      if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) {
        throw new TypegenError("Timeout must be a positive number", ErrorCodes.INVALID_INPUT);
      }
    }

    this.apiKey = options.apiKey.trim();
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.commitTimeout = options.commitTimeout ?? options.timeout ?? DEFAULT_COMMIT_TIMEOUT_MS;
  }

  /**
   * Fetch, check the status, and parse the JSON body under ONE timeout: the
   * timer starts before `fetch` and is cleared only after the body is read, so
   * a server that sends headers promptly and then stalls the body still times
   * out. Retries 429, 5xx, and network errors only when `retryTransient` is
   * set. Mutation requests opt out because a failed-after-send commit may
   * already have been applied server-side. A timeout is never retried.
   */
  private async requestJson<T>(
    url: string,
    init: RequestInit,
    opts: RequestJsonOptions,
  ): Promise<T> {
    const retryTransient = opts.retryTransient ?? true;
    const timeoutMs = opts.timeoutMs ?? this.timeout;
    let attempt = 0;

    for (;;) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let retryAfterMs: number | undefined;

      try {
        let response: Response | undefined;
        try {
          response = await fetch(url, { ...init, signal: controller.signal });
        } catch (error) {
          const isAbort = error instanceof Error && error.name === "AbortError";
          if (!(retryTransient && !isAbort && attempt < MAX_RETRIES)) {
            throw error;
          }
          retryAfterMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        }

        if (response) {
          if (response.ok) {
            return (await response.json()) as T;
          }

          const retryable = retryTransient && (response.status === 429 || response.status >= 500);
          if (!(retryable && attempt < MAX_RETRIES)) {
            throw await httpError(response, opts);
          }
          retryAfterMs = retryDelayMs(response, attempt + 1);
          await discardBody(response);
        }
      } finally {
        clearTimeout(timeoutId);
      }

      attempt++;
      await delay(retryAfterMs ?? 0);
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Validate API key and get project info
   * GET /v1/project
   */
  async validateApiKey(): Promise<ProjectInfo> {
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.project}`;

    try {
      const projectInfo = await this.requestJson<ProjectInfo>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to validate API key" },
      );
      this.projectInfo = projectInfo;
      return projectInfo;
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TypegenError(
          `Request timeout after ${this.timeout}ms`,
          ErrorCodes.API_TIMEOUT,
          error,
        );
      }
      throw wrapError(error, "Failed to validate API key", ErrorCodes.API_FETCH_FAILED);
    }
  }

  /**
   * Fetch project schema from TMS
   * GET /v1/projects/:projectId/schema
   */
  async fetchSchema(): Promise<ProjectSchema> {
    const project = await this.getProjectInfo();
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectSchema(project.id)}`;

    try {
      return await this.requestJson<ProjectSchema>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to fetch schema", forbidden: "Access denied to this project" },
      );
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TypegenError(
          `Request timeout after ${this.timeout}ms`,
          ErrorCodes.API_TIMEOUT,
          error,
        );
      }
      throw wrapError(error, "Failed to fetch schema", ErrorCodes.API_FETCH_FAILED);
    }
  }

  /**
   * Fetch translations from TMS
   * GET /v1/translations
   */
  async fetchTranslations(options: FetchTranslationsOptions = {}): Promise<TranslationsResponse> {
    const params = new URLSearchParams();

    if (options.locales?.length) {
      params.set("locales", options.locales.join(","));
    }
    if (options.namespaces?.length) {
      params.set("namespaces", options.namespaces.join(","));
    }

    const queryString = params.toString();
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.translations}${queryString ? `?${queryString}` : ""}`;

    try {
      const body = await this.requestJson<ApiTranslationsResponse>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to fetch translations", forbidden: "Access denied to this project" },
      );
      return normalizeTranslationsResponse(body);
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TypegenError(
          `Request timeout after ${this.timeout}ms`,
          ErrorCodes.API_TIMEOUT,
          error,
        );
      }
      throw wrapError(error, "Failed to fetch translations", ErrorCodes.API_FETCH_FAILED);
    }
  }

  /**
   * Fetch project namespaces from TMS
   * GET /v1/projects/:projectId/namespaces
   */
  async fetchNamespaces(): Promise<NamespaceInfo[]> {
    const project = await this.getProjectInfo();
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectNamespaces(project.id)}`;

    try {
      const namespaces = await this.requestJson<NamespaceInfo[]>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to fetch namespaces", forbidden: "Access denied to project namespaces" },
      );
      if (!Array.isArray(namespaces)) {
        throw new TypegenError(
          "Invalid namespaces response: expected an array",
          ErrorCodes.API_INVALID_RESPONSE,
        );
      }

      return namespaces;
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TypegenError(
          `Request timeout after ${this.timeout}ms`,
          ErrorCodes.API_TIMEOUT,
          error,
        );
      }
      throw wrapError(error, "Failed to fetch namespaces", ErrorCodes.API_FETCH_FAILED);
    }
  }

  /**
   * Fetch the namespace currently marked default by the project.
   */
  async fetchDefaultNamespace(): Promise<string> {
    const namespaces = await this.fetchNamespaces();
    const defaults = namespaces.filter((ns) => ns.isDefault);

    if (defaults.length !== 1) {
      throw new TypegenError(
        defaults.length === 0
          ? "Project has no default namespace"
          : "Project has multiple default namespaces",
        ErrorCodes.API_INVALID_RESPONSE,
      );
    }

    return defaults[0].namespace;
  }

  /**
   * Push translations to TMS
   * POST /v1/projects/:projectId/import/commit
   */
  async pushTranslations(options: PushTranslationsOptions): Promise<PushResult> {
    const project = await this.getProjectInfo();
    const remote =
      options.preloadedRemote ??
      (options.forceMode === "keep" || options.forceMode === "abort"
        ? await this.fetchTranslations()
        : undefined);

    const result: PushResult = {
      created: 0,
      updated: 0,
      skipped: 0,
    };
    const conflictCount = remote ? countConflicts(options.translations, remote.translations) : 0;

    if (options.forceMode === "abort" && conflictCount > 0) {
      throw new TypegenError(
        `Conflict detected for ${conflictCount} translations. Use --force-mode override or keep.`,
        ErrorCodes.API_FETCH_FAILED,
      );
    }

    const total = countTranslationValues(options.translations);
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectImportCommit(project.id)}`;
    try {
      // retryTransient: false — a commit that failed after send may already be applied
      const body = await this.requestJson<BulkImportResponse>(
        url,
        {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify({
            namespaces: toNamespaceImportData(options.translations),
            options: {
              conflictResolution: toImportConflictResolution(options.forceMode),
              createNamespaces: true,
              deleteOrphans: false,
            },
          }),
        },
        {
          retryTransient: false,
          failure: "Failed to push translations",
          forbidden: "Access denied to this project",
          timeoutMs: this.commitTimeout,
        },
      );
      if (!body.success) {
        const firstError = body.errors?.[0];
        throw new TypegenError(
          firstError
            ? `Failed to push translations: ${firstError.namespace}:${firstError.key} ${firstError.message}`
            : "Failed to push translations",
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      result.created = body.stats.keysCreated;
      result.updated = body.stats.translationsUpdated;
      result.skipped = options.forceMode === "keep" ? conflictCount : 0;

      options.onProgress?.({
        total,
        completed: total,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      });

      return result;
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TypegenError(
          `Push timed out after ${this.commitTimeout}ms: the platform may still have applied it. ` +
            "It is safe to re-run the same push; raise COMVI_TIMEOUT_MS for a very large catalog.",
          ErrorCodes.API_TIMEOUT,
          error,
        );
      }
      throw wrapError(error, "Failed to push translations", ErrorCodes.API_FETCH_FAILED);
    }
  }

  /**
   * Check if the API is reachable and credentials are valid
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.validateApiKey();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to real-time schema updates via Server-Sent Events
   * GET /v1/projects/:projectId/schema/stream
   *
   * @param onSchema - Callback when schema update is received
   * @returns Cleanup function to close SSE connection
   */
  async subscribeToSchemaUpdates(
    onSchema: (schema: ProjectSchema) => Promise<void>,
  ): Promise<() => void> {
    const project = await this.getProjectInfo();
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectSchemaStream(project.id)}`;

    const generation = ++this.subscriptionGeneration;
    this.eventSource?.close();
    this.eventSource = undefined;

    // Lazy import: eventsource is only needed for watch mode, and the static
    // import would slow down every CLI invocation
    const { EventSource } = await import("eventsource");

    if (generation !== this.subscriptionGeneration) {
      return () => undefined;
    }

    const apiKey = this.apiKey;
    const eventSource = new EventSource(url, {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${apiKey}`);

        return fetch(input, {
          ...init,
          headers,
        });
      },
    });
    this.eventSource = eventSource;

    // Serialize updates: EventSource does not await handlers, so a burst of
    // events would otherwise run concurrent onSchema file writes
    let queue: Promise<void> = Promise.resolve();
    eventSource.onmessage = (event: MessageEvent) => {
      queue = queue
        .then(async () => {
          if (generation !== this.subscriptionGeneration || this.eventSource !== eventSource) {
            return;
          }
          const schema = JSON.parse(event.data) as ProjectSchema;
          await onSchema(schema);
        })
        .catch((error) => {
          // Ignore malformed events (could be keep-alive comments)
          console.error("[@comvi/cli] Failed to process SSE event:", error);
        });
    };

    // Handle errors (auto-reconnects by default)
    eventSource.onerror = () => {
      // On reconnect, server sends current schema immediately
      console.warn("[@comvi/cli] Schema update stream interrupted; reconnecting...");
    };

    return () => {
      eventSource.close();
      if (this.eventSource === eventSource) {
        this.subscriptionGeneration++;
        this.eventSource = undefined;
      }
    };
  }

  /**
   * Close any open SSE connection
   */
  close(): void {
    this.subscriptionGeneration++;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
  }

  private async getProjectInfo(): Promise<ProjectInfo> {
    if (this.projectInfo) {
      return this.projectInfo;
    }

    this.projectInfoPromise ??= this.validateApiKey().finally(() => {
      this.projectInfoPromise = undefined;
    });

    return this.projectInfoPromise;
  }
}

function normalizeTranslationsResponse(response: ApiTranslationsResponse): TranslationsResponse {
  // All three levels are keyed by names the CLI does not control — the server
  // chose the locales and namespaces, the project chose the keys — so all
  // three are null-prototype maps, and `Object.entries` reads own keys only.
  // The key level matters as much as the other two: a local key named
  // `constructor` compared against a plain remote catalog found an inherited
  // function and counted as a conflict against a key the remote never had.
  const translations: TranslationData = emptyDictionary();
  const namespaceNames = Object.keys(response.namespaces);

  for (const [namespace, locales] of Object.entries(response.namespaces)) {
    for (const [locale, values] of Object.entries(locales)) {
      translations[locale] ??= emptyDictionary();
      translations[locale][namespace] = dictionaryFrom(values);
    }
  }

  return {
    locales: response.locales,
    namespaces: namespaceNames,
    translations,
  };
}

function countConflicts(local: TranslationData, remote: TranslationData): number {
  let conflicts = 0;

  for (const [locale, namespaces] of Object.entries(local)) {
    for (const [namespace, keys] of Object.entries(namespaces)) {
      const remoteKeys = ownValue(ownValue(remote, locale), namespace);

      for (const [key, value] of Object.entries(keys)) {
        // Own key only: `remoteKeys["toString"]` on a plain object answers with
        // an inherited function for a key the remote catalog does not have.
        const remoteValue = ownValue(remoteKeys, key);
        if (remoteValue !== undefined && remoteValue !== value) {
          conflicts++;
        }
      }
    }
  }

  return conflicts;
}

/** `map[key]`, but only when `key` is the map's own — never an inherited member. */
function ownValue<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && hasOwnKey(map, key) ? map[key] : undefined;
}

function countTranslationValues(translations: TranslationData): number {
  let total = 0;

  for (const namespaces of Object.values(translations)) {
    for (const keys of Object.values(namespaces)) {
      total += Object.keys(keys).length;
    }
  }

  return total;
}

function toNamespaceImportData(
  translations: TranslationData,
): Record<string, Record<string, Record<string, string>>> {
  // Same reason as `normalizeTranslationsResponse`: the namespace names come
  // from the project's own directory layout, not from this code.
  const namespaces: Record<string, Record<string, Record<string, string>>> = emptyDictionary();

  for (const [locale, namespaceMap] of Object.entries(translations)) {
    for (const [namespace, keys] of Object.entries(namespaceMap)) {
      namespaces[namespace] ??= emptyDictionary();
      namespaces[namespace][locale] = keys;
    }
  }

  return namespaces;
}

function toImportConflictResolution(
  forceMode: Exclude<ForceMode, "ask">,
): "keep_local" | "keep_server" | "fail" {
  switch (forceMode) {
    case "override":
      return "keep_local";
    case "keep":
      return "keep_server";
    case "abort":
      return "fail";
  }
}
