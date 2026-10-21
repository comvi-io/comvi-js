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

/** First wait before reopening a lost schema stream; doubles up to the max. */
const SSE_RECONNECT_BASE_MS = 1_000;
const SSE_RECONNECT_MAX_MS = 30_000;
/** The platform pings every 15 s; three missed pings means the stream is dead. */
const SSE_IDLE_LIMIT_MS = 45_000;
const SSE_WATCHDOG_INTERVAL_MS = 15_000;
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
  projectLocales: "/v1/project/locales",
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
  /** Stops the active schema subscription: its stream and its timers. */
  private stopSubscription?: () => void;
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
            try {
              return (await response.json()) as T;
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") throw error;
              throw new TypegenError(
                `${opts.failure}: the response is not JSON`,
                ErrorCodes.API_INVALID_RESPONSE,
              );
            }
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
      if (!isRecord(projectInfo) || typeof projectInfo.id !== "number") {
        throw invalidResponse("project");
      }
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
      throw wrapError(error, "Failed to validate API key", ErrorCodes.API_CONNECTION_FAILED);
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
      const schema = await this.requestJson<ProjectSchema>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to fetch schema", forbidden: "Access denied to this project" },
      );
      if (!isRecord(schema) || !isRecord(schema.keys)) {
        throw invalidResponse("schema");
      }
      return schema;
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
      throw wrapError(error, "Failed to fetch schema", ErrorCodes.API_CONNECTION_FAILED);
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
      if (!isRecord(body) || !Array.isArray(body.locales) || !isRecord(body.namespaces)) {
        throw invalidResponse("translations");
      }
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
      throw wrapError(error, "Failed to fetch translations", ErrorCodes.API_CONNECTION_FAILED);
    }
  }

  /**
   * The locale codes this key may read and write, in the project's spelling
   * (the key owner's language restrictions applied).
   * GET /v1/project/locales — `undefined` from a platform that lacks it.
   */
  async fetchProjectLocales(): Promise<string[] | undefined> {
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectLocales}`;

    let body: unknown;
    try {
      body = await this.requestJson<unknown>(
        url,
        { method: "GET", headers: this.authHeaders() },
        { failure: "Failed to fetch project locales", forbidden: "Access denied to this project" },
      );
    } catch (error) {
      // A platform without the route answers a plain 404; a project that is
      // gone says PROJECT_NOT_FOUND, and that one is the key's problem.
      if (
        error instanceof TypegenError &&
        error.details?.status === 404 &&
        error.details?.code !== "PROJECT_NOT_FOUND"
      ) {
        return undefined;
      }
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
      throw wrapError(error, "Failed to fetch project locales", ErrorCodes.API_CONNECTION_FAILED);
    }

    const locales = isRecord(body) ? body.locales : undefined;
    if (
      !Array.isArray(locales) ||
      !locales.every((l) => isRecord(l) && typeof l.code === "string")
    ) {
      throw invalidResponse("project locales");
    }
    return locales.map((l) => (l as { code: string }).code);
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
      throw wrapError(error, "Failed to fetch namespaces", ErrorCodes.API_CONNECTION_FAILED);
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
        ErrorCodes.CONFLICT,
      );
    }

    const total = countTranslationValues(options.translations);
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectImportCommit(project.id)}`;
    try {
      // retryTransient: false — a commit that failed after send may already be
      // applied. A 409 TRANSACTION_CONFLICT is the exception: the platform
      // rolled it back and says so, so it is sent once more.
      const commit = () =>
        this.requestJson<BulkImportResponse>(
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
      let body: BulkImportResponse;
      try {
        body = await commit();
      } catch (error) {
        if (!isRolledBackConflict(error)) throw error;
        await delay(RETRY_BASE_DELAY_MS);
        body = await commit();
      }
      if (
        !isRecord(body) ||
        typeof body.success !== "boolean" ||
        !isRecord(body.stats) ||
        typeof body.stats.keysCreated !== "number" ||
        (body.errors !== undefined && !Array.isArray(body.errors))
      ) {
        throw invalidResponse("import commit");
      }
      if (!body.success) {
        const firstError = body.errors?.[0];
        const conflict = body.errors?.some((e) => /^Conflict\b/i.test(e.message)) ?? false;
        throw new TypegenError(
          firstError
            ? `Failed to push translations: ${firstError.namespace}:${firstError.key} ${firstError.message}`
            : "Failed to push translations",
          conflict ? ErrorCodes.CONFLICT : ErrorCodes.VALIDATION_FAILED,
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
      throw wrapError(error, "Failed to push translations", ErrorCodes.API_CONNECTION_FAILED);
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
   * eventsource gives up for good on any non-200 (a 502 during a deploy
   * included) and never notices a connection that has gone quiet, so the
   * stream is supervised here: a lost stream is reopened with growing waits,
   * one that sends nothing (not even the platform's 15 s ping) for 45 s is
   * replaced, and a 401/403 is reported through `onFatal` instead of retried.
   * Every reopened stream starts with the full current schema.
   *
   * @returns Cleanup function that closes the stream and stops reconnecting
   */
  async subscribeToSchemaUpdates(
    onSchema: (schema: ProjectSchema) => Promise<void>,
    options: {
      /** The stream cannot recover: the key was rejected or lost access. */
      onFatal?: (error: TypegenError) => void;
      /** A line for the user about the stream's state. */
      onNotice?: (message: string) => void;
    } = {},
  ): Promise<() => void> {
    const project = await this.getProjectInfo();
    const url = `${this.apiBaseUrl}${API_ENDPOINTS.projectSchemaStream(project.id)}`;
    const notice =
      options.onNotice ?? ((message: string) => console.warn(`[@comvi/cli] ${message}`));

    this.stopSubscription?.();
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
    // The stream this subscription opened: it closes only its own.
    let current: EventSource | undefined;
    let stopped = false;
    let lastActivity = Date.now();
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = (source: EventSource) =>
      !stopped && generation === this.subscriptionGeneration && current === source;

    // Serialize updates: EventSource does not await handlers, so a burst of
    // events would otherwise run concurrent onSchema file writes
    let queue: Promise<void> = Promise.resolve();

    const scheduleReconnect = (reason: string) => {
      if (stopped || reconnectTimer) return;
      const waitMs = Math.min(SSE_RECONNECT_BASE_MS * 2 ** attempt, SSE_RECONNECT_MAX_MS);
      attempt++;
      notice(`Schema stream ${reason}; reconnecting in ${Math.round(waitMs / 1000)}s...`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        open();
      }, waitMs);
    };

    const open = () => {
      if (stopped || generation !== this.subscriptionGeneration) return;
      current?.close();
      lastActivity = Date.now();

      const eventSource: EventSource = new EventSource(url, {
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("Authorization", `Bearer ${apiKey}`);
          const response = await fetch(input, { ...init, headers });
          lastActivity = Date.now();
          // eventsource drops a refused response without reading or aborting
          // it; release the socket here.
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            return new Response(null, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }
          if (!response.body) return response;
          // Every chunk counts as life, the platform's `: ping` comments
          // included, which never reach onmessage.
          const tapped = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                lastActivity = Date.now();
                controller.enqueue(chunk);
              },
            }),
          );
          return new Response(tapped, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        },
      });
      current = eventSource;
      this.eventSource = eventSource;

      eventSource.onopen = () => {
        if (!isCurrent(eventSource)) return;
        if (attempt > 0) notice("Schema stream reconnected.");
        attempt = 0;
      };

      eventSource.onmessage = (event: MessageEvent) => {
        lastActivity = Date.now();
        queue = queue
          .then(async () => {
            if (!isCurrent(eventSource)) {
              return;
            }
            const schema = JSON.parse(event.data) as ProjectSchema;
            await onSchema(schema);
          })
          .catch((error) => {
            console.error("[@comvi/cli] Failed to process SSE event:", error);
          });
      };

      eventSource.onerror = (event?: { code?: number; message?: string }) => {
        if (!isCurrent(eventSource)) return;
        const status = event?.code;
        if (status === 401 || status === 403) {
          stop();
          options.onFatal?.(
            new TypegenError(
              status === 401
                ? "Invalid API key: the schema stream was refused"
                : "Access denied to the schema stream: the API key needs the schema:read scope",
              ErrorCodes.API_AUTH_FAILED,
              undefined,
              { status },
            ),
          );
          return;
        }
        // eventsource retries a failed connection itself every few seconds,
        // and gives up for good on a non-200; either way the waits are ours.
        eventSource.close();
        const reason =
          status && status !== 200
            ? `answered ${status}`
            : event?.message
              ? `failed (${event.message})`
              : "was interrupted";
        scheduleReconnect(reason);
      };
    };

    const watchdog = setInterval(() => {
      if (stopped || generation !== this.subscriptionGeneration) {
        clearInterval(watchdog);
        return;
      }
      if (reconnectTimer) return;
      if (Date.now() - lastActivity >= SSE_IDLE_LIMIT_MS) {
        current?.close();
        scheduleReconnect(`sent no data for ${SSE_IDLE_LIMIT_MS / 1000}s`);
      }
    }, SSE_WATCHDOG_INTERVAL_MS);

    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      current?.close();
      if (this.stopSubscription === stop) this.stopSubscription = undefined;
      if (generation === this.subscriptionGeneration) {
        this.subscriptionGeneration++;
        this.eventSource = undefined;
      }
    };
    this.stopSubscription = stop;

    open();
    return stop;
  }

  /**
   * Close any open SSE connection
   */
  close(): void {
    this.stopSubscription?.();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(what: string): TypegenError {
  return new TypegenError(
    `The platform's ${what} response is not in the expected shape`,
    ErrorCodes.API_INVALID_RESPONSE,
  );
}

/** A commit the platform rolled back on a deadlock and marked safe to retry. */
function isRolledBackConflict(error: unknown): boolean {
  return (
    error instanceof TypegenError &&
    error.details?.status === 409 &&
    error.details?.code === "TRANSACTION_CONFLICT"
  );
}
