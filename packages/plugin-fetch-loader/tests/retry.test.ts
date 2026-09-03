/**
 * The bounded retry on the project-info request.
 *
 * `fetchProjectInfoFromApi` is the one request the loader makes that is worth
 * repeating: it is small, idempotent, and everything behind it waits on it. The
 * policy is deliberately narrow — a 429, a 5xx or a transport failure gets two
 * more goes, a timeout and a 404 get none, and the whole thing may add at most
 * five seconds — because the alternative is a stalled `setLocaleAsync`.
 *
 * The retry lives INSIDE the pending-request entry, so every joiner of one
 * project-info lookup shares one sequence of attempts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchApiTranslations, fetchProjectInfo } from "../src/index";
import type { ProjectInfo } from "../src/index";
import { asFetch, jsonResponse, pendingTransport } from "./helpers/transport";

const BASE = "https://api.example.com";
const PROJECT_URL = `${BASE}/v1/project`;
const BACKOFF_MS = 250;

const PROJECT: ProjectInfo = {
  id: 42,
  organizationId: 1,
  name: "Test Project",
  description: null,
  sourceLocale: "en",
};

function failure(status: number, statusText: string, headers?: Record<string, string>): Response {
  return new Response(null, { status, statusText, headers });
}

/** Answers with `first` once, then with the project. Counts every call. */
function transportThatRecovers(first: () => Response) {
  const calls: string[] = [];
  const fetchFn = asFetch(
    vi.fn((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.resolve(calls.length === 1 ? first() : jsonResponse(PROJECT));
    }),
  );
  return { fetchFn, calls };
}

describe("retrying the project-info request", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a 503 and resolves on the second attempt", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetchFn, calls } = transportThatRecovers(() => failure(503, "Unavailable"));

    const request = fetchProjectInfo("key", BASE, 5000, fetchFn);
    await vi.advanceTimersByTimeAsync(BACKOFF_MS);

    await expect(request).resolves.toEqual(PROJECT);
    expect(calls).toEqual([PROJECT_URL, PROJECT_URL]);
  });

  it("waits the seconds a 429 asked for before retrying", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetchFn, calls } = transportThatRecovers(() =>
      failure(429, "Too Many Requests", { "Retry-After": "1" }),
    );

    const request = fetchProjectInfo("key", BASE, 5000, fetchFn);
    await vi.advanceTimersByTimeAsync(999);
    const callsBeforeTheWaitEnded = calls.length;
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toEqual(PROJECT);
    expect(callsBeforeTheWaitEnded).toBe(1);
  });

  it("gives up when Retry-After exceeds the latency budget", async () => {
    const fetchFn = asFetch(
      vi.fn(() => Promise.resolve(failure(429, "Too Many Requests", { "Retry-After": "30" }))),
    );

    await expect(fetchProjectInfo("key", BASE, 5000, fetchFn)).rejects.toThrow(
      "Failed to fetch project info: 429 Too Many Requests",
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("does not retry a request that timed out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const transport = pendingTransport();

    const request = fetchProjectInfo("key", BASE, 50, transport.fetchFn);
    const rejection = expect(request).rejects.toThrow("Request timeout after 50ms");
    await vi.advanceTimersByTimeAsync(5000);

    await rejection;
    expect(transport.urls).toEqual([PROJECT_URL]);
  });

  it("does not retry when the caller turned retrying off", async () => {
    const { fetchFn, calls } = transportThatRecovers(() => failure(503, "Unavailable"));

    await expect(
      fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, { retry: false }),
    ).rejects.toThrow("Failed to fetch project info: 503 Unavailable");
    expect(calls).toEqual([PROJECT_URL]);
  });

  it("stops retrying when the caller aborts during the backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const caller = new AbortController();
    const { fetchFn, calls } = transportThatRecovers(() => failure(503, "Unavailable"));

    const request = fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, {
      signal: caller.signal,
    });
    await vi.advanceTimersByTimeAsync(1);
    caller.abort();
    const rejection = expect(request).rejects.toThrow(
      `[FetchLoader] Request aborted: ${PROJECT_URL}`,
    );
    await vi.advanceTimersByTimeAsync(5000);

    await rejection;
    expect(calls).toEqual([PROJECT_URL]);
  });

  it("shares one sequence of attempts between everyone joining the request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetchFn, calls } = transportThatRecovers(() => failure(503, "Unavailable"));

    const joined = Promise.all([
      fetchProjectInfo("key", BASE, 5000, fetchFn),
      fetchProjectInfo("key", BASE, 5000, fetchFn),
      fetchProjectInfo("key", BASE, 5000, fetchFn),
    ]);
    await vi.advanceTimersByTimeAsync(BACKOFF_MS);

    await expect(joined).resolves.toEqual([PROJECT, PROJECT, PROJECT]);
    expect(calls).toEqual([PROJECT_URL, PROJECT_URL]);
  });

  it("does not retry the 404 that selects the legacy export URL", async () => {
    const requested: string[] = [];
    const fetchFn = asFetch(
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith("/v1/project")) return Promise.resolve(jsonResponse(PROJECT));
        if (url.includes("/api/v1/api/projects/")) {
          return Promise.resolve(jsonResponse({ locales: ["en"], namespaces: { default: {} } }));
        }
        return Promise.resolve(failure(404, "Not Found"));
      }),
    );

    await fetchApiTranslations("key", "en", ["default"], BASE, 5000, fetchFn);

    expect(requested.filter((url) => url.includes("/export?")).length).toBe(2);
    expect(requested.filter((url) => url.endsWith("/v1/project")).length).toBe(1);
  });
});
