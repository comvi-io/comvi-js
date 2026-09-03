/**
 * The request timeout covers the BODY, not only the headers.
 *
 * Every JSON request the loader makes is two waits: the response, then reading
 * it. A timer that is cleared once the headers arrive leaves the second wait
 * unbounded, so a server that answers and then stalls holds `setLocaleAsync`
 * open forever and `onLoadError` never fires. Each test here stalls the body of
 * one request shape and asserts the timeout still lands.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { FetchLoader, fetchApiTranslations, fetchProjectInfo } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { asFetch, jsonResponse } from "./helpers/transport";
import { TEST_API_KEY, TEST_CDN_URL } from "./setup";

const BASE = "https://api.example.com";
const TIMEOUT_MS = 50;

/** Headers have arrived; the body never will. */
function stalledBody(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: () => new Promise<never>(() => {}),
  } as unknown as Response;
}

/** Answers every request with a response whose body stalls. */
function stalledTransport(): typeof fetch {
  return asFetch(vi.fn(() => Promise.resolve(stalledBody())));
}

describe("a response body that never arrives", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out a CDN namespace and reports it through onLoadError", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(globalThis, "fetch").mockImplementation(stalledTransport());
    const onLoadError = vi.fn();
    const i18n = new I18n({ locale: "en", devMode: false });

    await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      timeout: TIMEOUT_MS,
      onLoadError,
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    const rejection = expect(pending).rejects.toThrow(`Request timeout after ${TIMEOUT_MS}ms`);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

    await rejection;
    expect(onLoadError).toHaveBeenCalledWith(
      "en",
      "default",
      expect.objectContaining({ message: `Request timeout after ${TIMEOUT_MS}ms` }),
    );
  });

  it("times out the API translations request and reports it through onLoadError", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(globalThis, "fetch").mockImplementation(stalledTransport());
    const onLoadError = vi.fn();
    const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY });

    await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      baseUrl: BASE,
      loadOnInit: false,
      timeout: TIMEOUT_MS,
      onLoadError,
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    const rejection = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

    await rejection;
    expect(onLoadError).toHaveBeenCalledWith(
      "en",
      "default",
      expect.objectContaining({ message: `Request timeout after ${TIMEOUT_MS}ms` }),
    );
  });

  it("times out the project info request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const request = fetchProjectInfo("key", BASE, TIMEOUT_MS, stalledTransport());
    const rejection = expect(request).rejects.toThrow(`Request timeout after ${TIMEOUT_MS}ms`);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

    await rejection;
  });

  it("times out the export request the 404 fallback reaches for", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchFn = asFetch(
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/translations")) {
          return Promise.resolve(new Response(null, { status: 404, statusText: "Not Found" }));
        }
        if (url.endsWith("/v1/project")) return Promise.resolve(jsonResponse({ id: 42 }));
        return Promise.resolve(stalledBody());
      }),
    );

    const request = fetchApiTranslations("key", "en", ["default"], BASE, TIMEOUT_MS, fetchFn);
    const rejection = expect(request).rejects.toThrow(`Request timeout after ${TIMEOUT_MS}ms`);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

    await rejection;
  });
});
