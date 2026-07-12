/**
 * Cache-identity and cancellation contract for custom transports.
 *
 * When fetchApiTranslations/fetchProjectInfo run over a custom fetchFn (the
 * Chrome extension's proxy transport), the apiKey is empty — the credential
 * lives outside the page. The default baseUrl+apiKey cache key would then be
 * identical for every transport, so project metadata must be scoped by an
 * explicit cacheScope (or not cached at all).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchProjectInfo, clearProjectInfoCache } from "../src/index";

const BASE = "https://api.comvi.io";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchFnReturningProject(id: number) {
  return vi.fn(async () => jsonResponse({ id, name: `project-${id}` }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clearProjectInfoCache();
});

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

  it("a stale request cannot delete or overwrite the new pending owner", async () => {
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
    expect(unexpectedFetch).not.toHaveBeenCalled();

    await expect(
      fetchProjectInfo("", BASE, 5000, unexpectedFetch, "scope-a"),
    ).resolves.toMatchObject({
      id: 2,
    });
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  it("scoped entries do not collide with keyed entries", async () => {
    const keyed = await fetchProjectInfo("real-key", BASE, 5000, fetchFnReturningProject(10));
    const scoped = await fetchProjectInfo("", BASE, 5000, fetchFnReturningProject(20), "scope-x");
    expect(keyed.id).toBe(10);
    expect(scoped.id).toBe(20);
  });
});

describe("timeout cancellation reaches the transport", () => {
  it("aborts the underlying fetchFn signal when the loader timeout fires", async () => {
    let observedSignal: AbortSignal | undefined;
    const neverResolves = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          observedSignal = init?.signal ?? undefined;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    await expect(
      fetchProjectInfo("", BASE, 50, neverResolves as unknown as typeof fetch, "scope-t"),
    ).rejects.toThrow(/timeout after 50ms/);

    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
  });
});
