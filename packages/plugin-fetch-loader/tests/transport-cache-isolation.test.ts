/**
 * Cache-identity and cancellation contract for custom transports.
 *
 * When fetchApiTranslations/fetchProjectInfo run over a custom fetchFn (the
 * Chrome extension's proxy transport), the apiKey is empty — the credential
 * lives outside the page. The default baseUrl+apiKey cache key would then be
 * identical for every transport, so project metadata must be scoped by an
 * explicit cacheScope (or not cached at all).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchApiTranslations, fetchProjectInfo, clearProjectInfoCache } from "../src/index";
import { deferred } from "./helpers/deferred";

const BASE = "https://api.comvi.io";

/** The transports below are partial stand-ins; `fetchProjectInfo` only ever calls them. */
const asFetch = (fn: unknown) => fn as typeof fetch;

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchFnReturningProject(id: number) {
  return vi.fn(async () => jsonResponse({ id }));
}

describe("project-info cache isolation for custom transports", () => {
  it("sequential transports with different projects never share metadata", async () => {
    const first = await fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(1), "scope-a");
    const second = await fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(2), "scope-b");

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });

  it("concurrent transports with different projects never share metadata", async () => {
    const [first, second] = await Promise.all([
      fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(1), "scope-a"),
      fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(2), "scope-b"),
    ]);

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });

  it("caches within one scope", async () => {
    const fetchFn = fetchFnReturningProject(7);
    await fetchProjectInfo("", BASE, 5000, fetchFn, "scope-a");
    await fetchProjectInfo("", BASE, 5000, fetchFn, "scope-a");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("skips caching entirely for a keyless transport without a scope", async () => {
    const fetchFn = fetchFnReturningProject(7);
    await fetchProjectInfo("", BASE, 5000, fetchFn);
    await fetchProjectInfo("", BASE, 5000, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("clearProjectInfoCache(scope) clears only that scope", async () => {
    const fetchA = fetchFnReturningProject(1);
    const fetchB = fetchFnReturningProject(2);
    await fetchProjectInfo("", BASE, 5000, fetchA, "scope-a");
    await fetchProjectInfo("", BASE, 5000, fetchB, "scope-b");

    clearProjectInfoCache("scope-a");

    await fetchProjectInfo("", BASE, 5000, fetchA, "scope-a"); // refetches
    await fetchProjectInfo("", BASE, 5000, fetchB, "scope-b"); // cached
    expect(fetchA).toHaveBeenCalledTimes(2);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it("does not let a cleared pending request repopulate its scope", async () => {
    const firstResponse = deferred<Response>();
    const firstFetch = vi.fn(() => firstResponse.promise);
    const first = fetchProjectInfo("", BASE, 5000, firstFetch, "scope-a");

    clearProjectInfoCache("scope-a");
    firstResponse.resolve(jsonResponse({ id: 1 }));
    await expect(first).resolves.toMatchObject({ id: 1 });

    const secondFetch = fetchFnReturningProject(2);
    await expect(fetchProjectInfo("", BASE, 5000, secondFetch, "scope-a")).resolves.toMatchObject({
      id: 2,
    });
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it("lifecycle: a stale resolve, then a join, then a fresh call all observe the new owner", async () => {
    const staleResponse = deferred<Response>();
    const currentResponse = deferred<Response>();
    const staleFetch = vi.fn(() => staleResponse.promise);
    const currentFetch = vi.fn(() => currentResponse.promise);
    const unexpectedFetch = fetchFnReturningProject(3);

    const stale = fetchProjectInfo("", BASE, 5000, staleFetch, "scope-a");
    clearProjectInfoCache("scope-a");
    const current = fetchProjectInfo("", BASE, 5000, currentFetch, "scope-a");

    staleResponse.resolve(jsonResponse({ id: 1 }));
    await stale;
    const joinedCurrent = fetchProjectInfo("", BASE, 5000, unexpectedFetch, "scope-a");
    currentResponse.resolve(jsonResponse({ id: 2 }));

    await expect(current).resolves.toMatchObject({ id: 2 });
    await expect(joinedCurrent).resolves.toMatchObject({ id: 2 });
    await expect(
      fetchProjectInfo("", BASE, 5000, unexpectedFetch, "scope-a"),
    ).resolves.toMatchObject({ id: 2 });
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  it("scoped entries do not collide with keyed entries", async () => {
    const keyed = await fetchProjectInfo("real-key", BASE, 5000, fetchFnReturningProject(10));
    const scoped = await fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(20), "scope-x");
    expect(keyed.id).toBe(10);
    expect(scoped.id).toBe(20);
  });
});

describe("fetchProjectInfo() cancellation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the underlying fetchFn signal when the loader timeout fires", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let observedSignal: AbortSignal | undefined;
    const requested = deferred<void>();
    const neverResolves = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          observedSignal = init?.signal ?? undefined;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
          requested.resolve();
        }),
    );

    const request = fetchProjectInfo("", BASE, 50, asFetch(neverResolves), "scope-t");
    const rejection = expect(request).rejects.toThrow(/timeout after 50ms/);
    await requested.promise;
    await vi.advanceTimersByTimeAsync(51);
    await rejection;

    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
  });
});

describe("fetchApiTranslations() over a custom transport", () => {
  it("propagates external abort through the project-info fallback", async () => {
    const controller = new AbortController();
    const projectRequestStarted = deferred<void>();
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/translations")) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      projectRequestStarted.resolve();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const request = fetchApiTranslations(
      "",
      "en",
      ["default"],
      BASE,
      5000,
      asFetch(fetchFn),
      "scope-abort",
      { signal: controller.signal },
    );
    await projectRequestStarted.promise;
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("preserves custom transport, cache scope, and cache options across fallbacks", async () => {
    const calls: Array<{ url: string; init?: RequestInit & { next?: unknown } }> = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init as RequestInit & { next?: unknown } });
      if (url.includes("/v1/translations")) return new Response(null, { status: 404 });
      if (url.endsWith("/v1/project")) return jsonResponse({ id: 42 });
      return jsonResponse({ namespaces: { default: { en: { hello: "Hi" } } } });
    });

    await expect(
      fetchApiTranslations("", "en", ["default"], BASE, 5000, asFetch(fetchFn), "scope-cache", {
        next: { revalidate: 60, tags: ["i18n"] },
      }),
    ).resolves.toEqual(new Map([["en:default", { hello: "Hi" }]]));

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init?.next).toEqual({ revalidate: 60, tags: ["i18n"] });
    }
  });

  it("reports the actual legacy URL when its JSON is malformed", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/translations")) return new Response(null, { status: 404 });
      if (url.endsWith("/v1/project")) return jsonResponse({ id: 42 });
      if (url.includes("/v1/projects/42/export")) return new Response(null, { status: 404 });
      return new Response("{not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      fetchApiTranslations("", "en", ["default"], BASE, 5000, asFetch(fetchFn), "scope"),
    ).rejects.toThrow(/Invalid JSON response from .*\/api\/v1\/api\/projects\/42\/export/);
  });

  it("rejects a successful API error envelope without namespaces", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: "upstream failure" }));

    await expect(
      fetchApiTranslations("", "en", ["default"], BASE, 5000, asFetch(fetchFn), "scope"),
    ).rejects.toThrow(/namespaces/);
  });
});
