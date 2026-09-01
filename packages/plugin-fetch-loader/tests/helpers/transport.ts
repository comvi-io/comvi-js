import { vi } from "vitest";
import { deferred } from "./deferred";

/**
 * The `fetchFn` seam of `fetchProjectInfo` / `fetchApiTranslations`: the
 * transport a proxy host (the Chrome extension) supplies instead of the page's
 * `fetch`. Tests drive it directly, so no request ever leaves through msw.
 */
export const asFetch = (fn: unknown) => fn as typeof fetch;

export function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export interface TransportCall {
  url: string;
  init?: RequestInit & { next?: unknown };
}

export interface RecordingTransport {
  fetchFn: typeof fetch;
  calls: TransportCall[];
}

/** Answers each request from `route(url)` and records what it was asked for. */
export function recordingTransport(
  route: (url: string) => Response | Promise<Response>,
): RecordingTransport {
  const calls: TransportCall[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init as TransportCall["init"] });
    return route(url);
  });
  return { fetchFn: asFetch(fetchFn), calls };
}

export interface PendingTransport {
  fetchFn: typeof fetch;
  /** Settles once the transport has been asked for something. */
  requested: Promise<void>;
  /** Every URL the transport was asked for, in call order. */
  urls: string[];
  /** The `signal` each request was issued with, in call order. */
  signals: Array<AbortSignal | undefined>;
  /** Answers every outstanding and future request with `data`. */
  resolve: (data: unknown) => void;
}

/**
 * A transport that holds every request open until the test answers it, and
 * rejects with a DOMException — exactly as `fetch` does — when the request's
 * signal is aborted.
 *
 * `rejectOnAbort: false` leaves an aborted request hanging instead: the shape a
 * test needs when the aborted request has no consumer left to observe its
 * rejection.
 */
export function pendingTransport({ rejectOnAbort = true } = {}): PendingTransport {
  const requested = deferred<void>();
  const answer = deferred<unknown>();
  const signals: Array<AbortSignal | undefined> = [];
  const urls: string[] = [];
  const fetchFn = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        urls.push(String(input));
        signals.push(init?.signal ?? undefined);
        if (rejectOnAbort) {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }
        void answer.promise.then((data) => resolve(jsonResponse(data)));
        requested.resolve();
      }),
  );
  return {
    fetchFn: asFetch(fetchFn),
    requested: requested.promise,
    urls,
    signals,
    resolve: answer.resolve,
  };
}

export interface DeferredBodyResponse {
  /** Settles once the caller has started reading the body. */
  parsing: Promise<void>;
  resolve: (data: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Replaces global fetch with a response whose headers have arrived but whose
 * BODY the test releases — the one window in which the loader holds a response
 * it may still have to discard.
 */
export function stubFetchWithDeferredBody(): DeferredBodyResponse {
  const parsing = deferred<void>();
  const body = deferred<unknown>();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => {
      parsing.resolve();
      return body.promise;
    },
  } as unknown as Response);
  return { parsing: parsing.promise, resolve: body.resolve, reject: body.reject };
}
