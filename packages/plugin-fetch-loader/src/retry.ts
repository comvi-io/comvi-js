import { RequestAbortedError, isAborted, isTimeout } from "./http";

/** Extra attempts a failed request gets, and the ceiling on what they may cost. */
const MAX_RETRIES = 2;
const BACKOFF_MS = 250;
const LATENCY_BUDGET_MS = 5000;

/** A failure the response explained: the status, and what it asked us to wait. */
export interface HttpFailure extends Error {
  status?: number;
  retryAfter?: string | null;
}

export function httpFailure(
  message: string,
  status: number,
  retryAfter: string | null,
): HttpFailure {
  const error: HttpFailure = new Error(message);
  error.status = status;
  error.retryAfter = retryAfter;
  return error;
}

/**
 * Run `attempt` again after a 429, a 5xx or a transport failure.
 *
 * Never after a timeout — core's fallback-locale loop and `onLoadError` would
 * wait three of them instead of one. Never after a 404, which on the API path
 * is how the legacy export URL is selected rather than a failure. Never after
 * an abort. The added latency is capped at five seconds in total, so a server
 * asking for a longer `Retry-After` is taken at its word and not retried.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  let budgetLeft = LATENCY_BUDGET_MS;

  for (let retriesLeft = MAX_RETRIES; ; retriesLeft--) {
    try {
      return await attempt();
    } catch (error) {
      const waitMs =
        retriesLeft > 0 ? delayFor(error, MAX_RETRIES - retriesLeft, budgetLeft) : undefined;
      if (waitMs === undefined) throw error;
      budgetLeft -= waitMs;
      await sleep(waitMs, url, signal);
    }
  }
}

/** How long to wait before trying again, or `undefined` for "do not". */
function delayFor(error: unknown, retryIndex: number, budgetLeft: number): number | undefined {
  if (isAborted(error) || isTimeout(error)) return undefined;

  const { status, retryAfter } = error as HttpFailure;
  if (status !== undefined && status !== 429 && status < 500) return undefined;

  const waitMs = retryAfterMs(retryAfter) ?? BACKOFF_MS * (retryIndex + 1);
  return waitMs <= budgetLeft ? waitMs : undefined;
}

/** `Retry-After` in seconds. An HTTP-date, or anything else, falls back to the backoff. */
function retryAfterMs(value: string | null | undefined): number | undefined {
  const seconds = value == null ? NaN : Number(value);
  return seconds >= 0 ? seconds * 1000 : undefined;
}

/** Waits, unless the caller gives up first — in which case no further attempt is made. */
function sleep(ms: number, url: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestAbortedError(url));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new RequestAbortedError(url));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
