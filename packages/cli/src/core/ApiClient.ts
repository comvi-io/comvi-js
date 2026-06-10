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

export interface ApiClientOptions {
  apiKey: string;
  apiBaseUrl: string;
  timeout?: number;
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
   * Called after each completed PUT, and once immediately if all work is
   * skipped. Keep this callback lightweight because it runs on the push path.
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

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_AFTER_CAP_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS);
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
  private eventSource?: EventSource;
  private projectInfo?: ProjectInfo;
  private projectInfoPromise?: Promise<ProjectInfo>;

  constructor(options: ApiClientOptions) {
    // Validate API key
    if (!options.apiKey || typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
      throw new TypegenError(
        "API key is required and must be a non-empty string",
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    // Validate API base URL
    if (!options.apiBaseUrl || typeof options.apiBaseUrl !== "string") {
      throw new TypegenError(
        "API base URL is required and must be a string",
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    // Validate URL format
    try {
      new URL(options.apiBaseUrl);
    } catch {
      throw new TypegenError(
        `Invalid API base URL: ${options.apiBaseUrl}`,
        ErrorCodes.INVALID_INPUT,
      );
    }

    // Validate timeout if provided
    if (options.timeout !== undefined) {
      if (typeof options.timeout !== "number" || options.timeout <= 0) {
        throw new TypegenError("Timeout must be a positive number", ErrorCodes.INVALID_INPUT);
      }
    }

    this.apiKey = options.apiKey.trim();
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = options.timeout ?? 30000; // 30 second default
  }

  /**
   * Run a fetch with timeout and bounded retry.
   * Retries 429 always (honoring Retry-After, capped); retries 5xx and
   * network errors only when `retryTransient` is set — POSTs are excluded
   * because a failed-after-send commit may already be applied server-side.
   */
  private async request(
    url: string,
    init: RequestInit,
    opts: { retryTransient?: boolean } = {},
  ): Promise<Response> {
    const retryTransient = opts.retryTransient ?? true;
    let attempt = 0;

    for (;;) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (retryTransient && !isAbort && attempt < MAX_RETRIES) {
          attempt++;
          await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      const retryable = response.status === 429 || (retryTransient && response.status >= 500);
      if (retryable && attempt < MAX_RETRIES) {
        attempt++;
        await delay(retryDelayMs(response, attempt));
        continue;
      }

      return response;
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
      const response = await this.request(url, {
        method: "GET",
        headers: this.authHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
        }
        throw new TypegenError(
          `Failed to validate API key: ${response.status} ${response.statusText}`,
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      const projectInfo = (await response.json()) as ProjectInfo;
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
      const response = await this.request(url, {
        method: "GET",
        headers: this.authHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
        }
        if (response.status === 403) {
          throw new TypegenError("Access denied to this project", ErrorCodes.API_AUTH_FAILED);
        }
        throw new TypegenError(
          `Failed to fetch schema: ${response.status} ${response.statusText}`,
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      return (await response.json()) as ProjectSchema;
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
      const response = await this.request(url, {
        method: "GET",
        headers: this.authHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
        }
        if (response.status === 403) {
          throw new TypegenError("Access denied to this project", ErrorCodes.API_AUTH_FAILED);
        }
        throw new TypegenError(
          `Failed to fetch translations: ${response.status} ${response.statusText}`,
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      return normalizeTranslationsResponse((await response.json()) as ApiTranslationsResponse);
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
      const response = await this.request(url, {
        method: "GET",
        headers: this.authHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
        }
        if (response.status === 403) {
          throw new TypegenError("Access denied to project namespaces", ErrorCodes.API_AUTH_FAILED);
        }
        throw new TypegenError(
          `Failed to fetch namespaces: ${response.status} ${response.statusText}`,
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      const namespaces = (await response.json()) as NamespaceInfo[];
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
      const response = await this.request(
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
        { retryTransient: false },
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new TypegenError("Invalid API key", ErrorCodes.API_AUTH_FAILED);
        }
        if (response.status === 403) {
          throw new TypegenError("Access denied to this project", ErrorCodes.API_AUTH_FAILED);
        }
        throw new TypegenError(
          `Failed to push translations: ${response.status} ${response.statusText}`,
          ErrorCodes.API_FETCH_FAILED,
        );
      }

      const body = (await response.json()) as BulkImportResponse;
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
          `Request timeout after ${this.timeout}ms`,
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

    this.eventSource?.close();

    // Lazy import: eventsource is only needed for watch mode, and the static
    // import would slow down every CLI invocation
    const { EventSource } = await import("eventsource");

    // Create EventSource with authorization
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
          const schema = JSON.parse(event.data) as ProjectSchema;
          await onSchema(schema);
        })
        .catch((error) => {
          // Ignore malformed events (could be keep-alive comments)
          console.error("[comvi] Failed to process SSE event:", error);
        });
    };

    // Handle errors (auto-reconnects by default)
    eventSource.onerror = () => {
      // On reconnect, server sends current schema immediately
      console.warn("[comvi] Schema update stream interrupted; reconnecting...");
    };

    // Return cleanup function
    return () => {
      eventSource.close();
      if (this.eventSource === eventSource) {
        this.eventSource = undefined;
      }
    };
  }

  /**
   * Close any open SSE connection
   */
  close(): void {
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
  const translations: TranslationData = {};
  const namespaceNames = Object.keys(response.namespaces);

  for (const [namespace, locales] of Object.entries(response.namespaces)) {
    for (const [locale, values] of Object.entries(locales)) {
      translations[locale] ??= {};
      translations[locale][namespace] = values;
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
      for (const [key, value] of Object.entries(keys)) {
        const remoteValue = remote[locale]?.[namespace]?.[key];
        if (remoteValue !== undefined && remoteValue !== value) {
          conflicts++;
        }
      }
    }
  }

  return conflicts;
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
  const namespaces: Record<string, Record<string, Record<string, string>>> = {};

  for (const [locale, namespaceMap] of Object.entries(translations)) {
    for (const [namespace, keys] of Object.entries(namespaceMap)) {
      namespaces[namespace] ??= {};
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
