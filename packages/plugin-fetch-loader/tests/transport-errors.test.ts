/**
 * How `fetchWithTimeout` classifies a failure: only its own timer produces a
 * timeout, only the caller's signal produces a cancellation, and anything else
 * reaches the caller untouched.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchApiTranslations, fetchProjectInfo } from "../src/index";
import { deferred } from "./helpers/deferred";
import { asFetch, jsonResponse, pendingTransport } from "./helpers/transport";

const BASE = "https://api.example.com";

describe("request failure classification", () => {
  it("does not turn a transport-level AbortError into a timeout", async () => {
    const fetchFn = asFetch(
      vi.fn(() => Promise.reject(new DOMException("The operation was aborted.", "AbortError"))),
    );

    await expect(fetchProjectInfo("key", BASE, 5000, fetchFn)).rejects.toThrow(
      "The operation was aborted.",
    );
  });

  it("surfaces a transport failure verbatim when the caller passed no signal", async () => {
    const fetchFn = asFetch(vi.fn(() => Promise.reject(new Error("network down"))));

    await expect(
      fetchApiTranslations("key", "en", ["default"], BASE, 5000, fetchFn),
    ).rejects.toThrow("network down");
  });

  it("names the aborted URL when the caller's signal fires mid-request", async () => {
    const transport = pendingTransport();
    const caller = new AbortController();

    const request = fetchApiTranslations(
      "key",
      "en",
      ["default"],
      BASE,
      5000,
      transport.fetchFn,
      undefined,
      { signal: caller.signal },
    );
    await transport.requested;
    caller.abort();

    await expect(request).rejects.toThrow(
      `[FetchLoader] Request aborted: ${BASE}/v1/translations?locales=en&namespaces=default`,
    );
  });
});

describe("request timer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces the failure of a transport that ignores the fired timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failure = deferred<Response>();
    const fetchFn = asFetch(vi.fn(() => failure.promise));

    const request = fetchProjectInfo("key", BASE, 50, fetchFn);
    const rejection = expect(request).rejects.toThrow("upstream exploded");
    await vi.advanceTimersByTimeAsync(51);
    failure.reject(new Error("upstream exploded"));

    await rejection;
  });

  it("leaves no pending timeout behind once the response has arrived", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchFn = asFetch(vi.fn(() => Promise.resolve(jsonResponse({ id: 1 }))));

    await fetchProjectInfo("key", BASE, 5000, fetchFn);

    expect(vi.getTimerCount()).toBe(0);
  });
});
