/**
 * The transport primitives BOTH request paths share: one JSON request under one
 * timeout, the abort vocabulary around it, and the identifier check every URL
 * builder runs before it interpolates a path segment.
 *
 * This module is deliberately free of endpoint knowledge. `http.ts` adds the
 * API URL builders and the response transform on top of it; `cdn-url.ts` adds
 * the CDN one. Keeping the two apart is what lets
 * `@comvi/plugin-fetch-loader/cdn` reach the request machinery without also
 * reaching the API path (`tests/cdn-graph.test.ts` asserts it).
 */
import type { FetchLoaderOptions } from "./options";

export interface ExtendedFetchOptions extends RequestInit {
  next?: { revalidate?: number | false; tags?: string[] };
}

export interface FetchRequestOptions {
  signal?: AbortSignal;
  next?: ExtendedFetchOptions["next"];
  /**
   * Set `false` to make the project-info request fail on its first refusal.
   * Read only there; `fetch` ignores it wherever these options reach an init.
   */
  retry?: boolean;
}

export function buildCacheOptions(
  cache?: FetchLoaderOptions["cache"],
): Pick<ExtendedFetchOptions, "next"> {
  if (!cache) return {};
  const next: ExtendedFetchOptions["next"] = {};
  if (cache.revalidate !== undefined) next.revalidate = cache.revalidate;
  if (cache.tags?.length) next.tags = cache.tags;
  return Object.keys(next).length ? { next } : {};
}

/**
 * Every error this package throws names the PACKAGE, not an export.
 * `[FetchLoader]` used to prefix them all, which reads as a bug report about a
 * symbol a `@comvi/plugin-fetch-loader/cdn` user never imported.
 */
export const ERROR_PREFIX = "[@comvi/plugin-fetch-loader]";

export class RequestAbortedError extends Error {
  constructor(url: string) {
    super(`${ERROR_PREFIX} Request aborted: ${url}`);
    this.name = "AbortError";
  }
}

export const isAborted = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** An Error the retry policy can tell apart from a transport failure. */
const named = (name: string, message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

export const isTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";

/** What a JSON request came back with: the parsed body, or why it was refused. */
export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; statusText: string; retryAfter: string | null };

/**
 * Fetch and parse JSON under ONE timeout, with external cancellation and SSR
 * cache support.
 *
 * The controller stays armed until the body has been read, so a server that
 * sends headers and then stalls fails the same way a stalled connection does.
 * The body read is raced against the signal because a transport is free to hand
 * back a body promise that ignores it.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: ExtendedFetchOptions,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<JsonResult<T>> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }
  let timedOut = false;
  const id = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchFn(url, { ...options, signal: controller.signal } as RequestInit);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        // `fetchFn` is a public seam: a hand-written transport may answer with a
        // bare `{ ok, status, statusText }` object and no headers at all.
        retryAfter: response.headers?.get?.("Retry-After") ?? null,
      };
    }
    return { ok: true, data: await raceAbort(parseJson<T>(response, url), controller.signal) };
  } catch (e) {
    if (timedOut && e instanceof Error && e.name === "AbortError")
      throw named("TimeoutError", `Request timeout after ${timeoutMs}ms`);
    if (externalSignal?.aborted) throw new RequestAbortedError(url);
    throw e;
  } finally {
    clearTimeout(id);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

async function parseJson<T>(response: Response, url: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (isAborted(error)) throw error;
    throw new Error(`${ERROR_PREFIX} Invalid JSON response from ${url}`);
  }
}

/** Loses to `signal`, so a body read that ignores it cannot outlive the timeout. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const fail = () => reject(named("AbortError", "The operation was aborted."));
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    }),
  ]);
}

export const stripSlash = (url: string) => url.replace(/\/$/, "");

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Validate locale/namespace identifiers to prevent malformed URLs */
const VALID_ID = /^[\w\-@.]+$/;

/** True when `value` is safe to interpolate as a single URL path segment. */
export const isSafeId = (value: string): boolean =>
  !!value && value !== "." && value !== ".." && VALID_ID.test(value);

export function validateId(value: string, label: string): void {
  if (!isSafeId(value))
    throw new Error(
      `${ERROR_PREFIX} Invalid ${label}: "${value}". Only alphanumeric, underscore, hyphen, dot, and @ characters are allowed; dot-only path segments are rejected.`,
    );
}
