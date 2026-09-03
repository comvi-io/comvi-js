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

describe("a response body that fails while it is read", () => {
  it("passes a transport's own AbortError through instead of calling it invalid JSON", async () => {
    const fetchFn = asFetch(
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
        } as unknown as Response),
      ),
    );

    await expect(
      fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, { retry: false }),
    ).rejects.toThrow("The operation was aborted.");
  });

  it("reports an unparseable body as invalid JSON", async () => {
    const fetchFn = asFetch(
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: () => Promise.reject(new SyntaxError("Unexpected token")),
        } as unknown as Response),
      ),
    );

    await expect(
      fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, { retry: false }),
    ).rejects.toThrow(`[FetchLoader] Invalid JSON response from ${BASE}/v1/project`);
  });

  it("gives up at once when the caller aborted before the body could be read", async () => {
    const caller = new AbortController();
    const url = `${BASE}/v1/translations?locales=en&namespaces=default`;
    const fetchFn = asFetch(
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: () => {
            caller.abort();
            return new Promise<never>(() => {});
          },
        } as unknown as Response),
      ),
    );

    await expect(
      fetchApiTranslations("key", "en", ["default"], BASE, 5000, fetchFn, undefined, {
        signal: caller.signal,
      }),
    ).rejects.toThrow(`[FetchLoader] Request aborted: ${url}`);
  });
});

describe("a transport that answers with a bare response object", () => {
  it("reports a non-OK response whose headers cannot be read", async () => {
    const fetchFn = asFetch(
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          statusText: "Unavailable",
          headers: {},
        } as unknown as Response),
      ),
    );

    await expect(
      fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, { retry: false }),
    ).rejects.toThrow("Failed to fetch project info: 503 Unavailable");
  });

  it("reports a non-OK response that carries no headers", async () => {
    const fetchFn = asFetch(
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 503, statusText: "Unavailable" } as Response),
      ),
    );

    await expect(
      fetchProjectInfo("key", BASE, 5000, fetchFn, undefined, { retry: false }),
    ).rejects.toThrow("Failed to fetch project info: 503 Unavailable");
  });
});
