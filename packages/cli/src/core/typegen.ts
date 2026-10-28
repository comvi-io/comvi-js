/**
 * The CLI's seam over the typegen Node API (`generate()`/`watch()` of the workspace-private
 * `@comvi/typegen`, inlined into this build): the platform source with the CLI's timeouts
 * and retries, and typegen's errors as `TypegenError`s, so every command keeps its exit
 * codes. `comvi typegen` and `comvi pull` (`.comvi/schema.json`) both go through here.
 */
import { CatalogFileError, PlatformError, type PlatformSourceOptions } from "@comvi/typegen";
import type { ComviConfig } from "../types";
import { ErrorCodes, TypegenError } from "../utils/errors";
import { DEFAULT_TIMEOUT_MS, timeoutsFromEnv } from "./timeouts";

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_AFTER_CAP_MS = 30_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfter(response: Response, attempt: number): number {
  const header = Number(response.headers.get("retry-after"));
  return Number.isFinite(header) && header >= 0
    ? Math.min(header * 1000, RETRY_AFTER_CAP_MS)
    : RETRY_BASE_DELAY_MS * 2 ** attempt;
}

/**
 * `fetch` with the CLI's read policy: one timeout over the request AND its body (the
 * signal stays on the response stream), and up to two retries of a network error, a 429
 * or a 5xx. The schema stream (`Accept: text/event-stream`) passes through: it is
 * long-lived, and the typegen source reconnects it itself.
 */
export function cliFetch(timeoutMs: number, base: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const accept = new Headers(init?.headers).get("accept") ?? "";
    if (accept.includes("text/event-stream")) return base(input, init);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await base(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if ((error as Error).name === "TimeoutError")
          throw new TypegenError(
            `The request to ${new URL(String(input)).origin} timed out after ${timeoutMs} ms (COMVI_TIMEOUT_MS)`,
            ErrorCodes.API_TIMEOUT,
            error as Error,
          );
        if (attempt >= MAX_RETRIES) throw error;
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        await response.body?.cancel().catch(() => undefined);
        await delay(retryAfter(response, attempt));
        continue;
      }
      return response;
    }
  };
}

/** The platform as a typegen source, for a loaded config (the key is validated there). */
export function platformSource(config: ComviConfig): { platform: PlatformSourceOptions } {
  return {
    platform: {
      apiKey: config.apiKey,
      apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
      fetch: cliFetch(timeoutsFromEnv().timeout ?? DEFAULT_TIMEOUT_MS),
    },
  };
}

/**
 * A typegen error as the `TypegenError` whose code gives the documented exit code: the
 * platform's (2 unavailable, 3 the key, 4 a wrong URL), an input the declarations cannot be
 * generated from (4), or a file that cannot be written (1).
 */
export function toCliError(error: unknown): unknown {
  if (error instanceof TypegenError || !(error instanceof Error)) return error;
  if (error instanceof PlatformError) {
    // The project was found (the key's project lookup passed), the route was not.
    if (error.status === 404 && error.message.includes("typegen schema v2"))
      return new TypegenError(
        `${error.message}: this platform predates the typegen schema v2 route`,
        ErrorCodes.API_UNSUPPORTED,
        error,
        { status: 404 },
      );
    if (error.status !== undefined)
      return new TypegenError(error.message, ErrorCodes.API_FETCH_FAILED, error, {
        status: error.status,
      });
    // The CLI's own timeout, raised inside fetch.
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof TypegenError) return cause;
    if (/ is not JSON$/.test(error.message))
      return new TypegenError(error.message, ErrorCodes.API_INVALID_RESPONSE, error);
    if (/^Cannot reach /.test(error.message))
      return new TypegenError(error.message, ErrorCodes.API_CONNECTION_FAILED, error);
    // The key is missing or the base URL is not a URL: the configuration.
    return new TypegenError(error.message, ErrorCodes.CONFIG_INVALID, error);
  }
  if (/^Invalid typegen schema v2 /.test(error.message))
    return new TypegenError(
      `The platform's typegen schema v2 is not valid: ${error.message}`,
      ErrorCodes.API_INVALID_RESPONSE,
      error,
    );
  if (
    (error as NodeJS.ErrnoException).syscall !== undefined &&
    !(error instanceof CatalogFileError)
  )
    return new TypegenError(error.message, ErrorCodes.FS_WRITE_FAILED, error);
  // A broken catalog, a schema the declarations cannot express (EmitError), a missing
  // directory or sourceLocale, an `augment` that resolves to nothing: the input.
  return new TypegenError(error.message, ErrorCodes.VALIDATION_FAILED, error);
}
