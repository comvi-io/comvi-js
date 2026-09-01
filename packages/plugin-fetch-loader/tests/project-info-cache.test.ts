/**
 * Project metadata is cached for an hour per baseUrl+apiKey and shared by every
 * caller. These pin the cache's lifetime, its bootstrap failures, and what a
 * clear does to a request that is still in flight.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { clearProjectInfoCache, fetchProjectInfo } from "../src/index";
import { jsonResponse, pendingTransport, recordingTransport } from "./helpers/transport";

const BASE = "https://api.example.com";
const TTL_MS = 60 * 60 * 1000;

const notFound = (statusText: string) => new Response(null, { status: 404, statusText });

describe("fetchProjectInfo() cache lifetime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the cached project until the hour-long TTL instant", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 0 });
    const first = recordingTransport(() => jsonResponse({ id: 1 }));
    const second = recordingTransport(() => jsonResponse({ id: 2 }));

    await fetchProjectInfo("key", BASE, 5000, first.fetchFn);
    vi.setSystemTime(TTL_MS - 1);

    await expect(fetchProjectInfo("key", BASE, 5000, second.fetchFn)).resolves.toMatchObject({
      id: 1,
    });
    expect(second.calls).toHaveLength(0);
  });

  it("refetches the project once the TTL instant is reached", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 0 });
    const first = recordingTransport(() => jsonResponse({ id: 1 }));
    const second = recordingTransport(() => jsonResponse({ id: 2 }));

    await fetchProjectInfo("key", BASE, 5000, first.fetchFn);
    vi.setSystemTime(TTL_MS);

    await expect(fetchProjectInfo("key", BASE, 5000, second.fetchFn)).resolves.toMatchObject({
      id: 2,
    });
  });

  it("retries the bootstrap after a failed attempt instead of replaying the failure", async () => {
    const failing = recordingTransport(
      () => new Response(null, { status: 500, statusText: "Server Error" }),
    );
    const succeeding = recordingTransport(() => jsonResponse({ id: 7 }));

    await expect(fetchProjectInfo("key", BASE, 5000, failing.fetchFn)).rejects.toThrow(
      "Failed to fetch project info: 500 Server Error",
    );

    await expect(fetchProjectInfo("key", BASE, 5000, succeeding.fetchFn)).resolves.toMatchObject({
      id: 7,
    });
  });
});

describe("fetchProjectInfo() endpoint fallback", () => {
  it("does not try the legacy endpoint when /v1/project fails with a non-404", async () => {
    const { fetchFn, calls } = recordingTransport(
      () => new Response(null, { status: 500, statusText: "Server Error" }),
    );

    await expect(fetchProjectInfo("key", BASE, 5000, fetchFn)).rejects.toThrow(
      "Failed to fetch project info: 500 Server Error",
    );

    expect(calls.map((call) => call.url)).toEqual([`${BASE}/v1/project`]);
  });

  it("reports the last endpoint's status text when both project endpoints 404", async () => {
    const { fetchFn, calls } = recordingTransport(() => notFound("Nope"));

    await expect(fetchProjectInfo("key", BASE, 5000, fetchFn)).rejects.toThrow(
      "Failed to fetch project info: 404 Nope",
    );

    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/v1/project`,
      `${BASE}/api/v1/api/project`,
    ]);
  });
});

describe("clearProjectInfoCache()", () => {
  it("detaches an in-flight request from callers that arrive after the clear", async () => {
    const inFlight = pendingTransport();
    const afterClear = recordingTransport(() => jsonResponse({ id: 2 }));

    const first = fetchProjectInfo("key", BASE, 5000, inFlight.fetchFn);
    await inFlight.requested;
    clearProjectInfoCache();
    const second = fetchProjectInfo("key", BASE, 5000, afterClear.fetchFn);
    inFlight.resolve({ id: 1 });

    await expect(first).resolves.toMatchObject({ id: 1 });
    await expect(second).resolves.toMatchObject({ id: 2 });
  });

  it("keeps a request that resolves after the clear out of the cache", async () => {
    const stale = pendingTransport();
    const fresh = recordingTransport(() => jsonResponse({ id: 2 }));

    const staleRequest = fetchProjectInfo("key", BASE, 5000, stale.fetchFn);
    await stale.requested;
    clearProjectInfoCache();
    stale.resolve({ id: 1 });
    await expect(staleRequest).resolves.toMatchObject({ id: 1 });

    await expect(fetchProjectInfo("key", BASE, 5000, fresh.fetchFn)).resolves.toMatchObject({
      id: 2,
    });
  });
});
