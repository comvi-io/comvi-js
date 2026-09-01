/**
 * The CDN branch of the plugin (no apiKey): what it loads at install time, and
 * what it does with a result that arrives once the plugin has been torn down.
 */
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { FetchLoader } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { deferred } from "./helpers/deferred";
import { stubFetchWithDeferredBody } from "./helpers/transport";
import { server, mockCdnErrorResponse, mockCdnSuccessResponse, TEST_CDN_URL } from "./setup";

const CDN_ABORTED = `[FetchLoader] Request aborted: ${TEST_CDN_URL}/en.json`;

describe("FetchLoader() in CDN mode", () => {
  it("loads the initial namespace when loadOnInit is left at its default", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    await FetchLoader({ cdnUrl: TEST_CDN_URL })(i18n);

    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("loads the namespaces already active on the host rather than the default one", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    i18n.addTranslations({ "fr:dashboard": { title: "Tableau" } });
    server.use(
      http.get(`${TEST_CDN_URL}/dashboard/en.json`, () =>
        HttpResponse.json({ title: "Dashboard" }),
      ),
    );

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true })(i18n);

    expect(i18n.t("title", { ns: "dashboard" })).toBe("Dashboard");
  });
});

describe("FetchLoader() in CDN mode after cleanup", () => {
  it("makes no request for a load started after cleanup", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    let requests = 0;
    server.use(
      http.get(`${TEST_CDN_URL}/en.json`, () => {
        requests++;
        return HttpResponse.json({ greeting: "Hello" });
      }),
    );

    const cleanup = await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);
    (cleanup as () => void)();

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(CDN_ABORTED);
    expect(requests).toBe(0);
  });

  it("discards a response whose body arrives after cleanup", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadSuccess = vi.fn();
    const response = stubFetchWithDeferredBody();

    const cleanup = await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      onLoadSuccess,
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    await response.parsing;
    (cleanup as () => void)();
    response.resolve({ greeting: "Hello" });

    await expect(pending).rejects.toThrow(CDN_ABORTED);
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

  it("does not reach for the fallback when the response fails after cleanup", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const fallback = vi.fn(() => Promise.resolve({ default: { greeting: "Offline" } }));
    const response = stubFetchWithDeferredBody();

    const cleanup = await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: { en: fallback },
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    await response.parsing;
    (cleanup as () => void)();
    response.reject(new SyntaxError("Unexpected token"));

    await expect(pending).rejects.toThrow(CDN_ABORTED);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("does not report a fallback failure that lands after cleanup", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    const fallbackStarted = deferred<void>();
    const fallbackResult = deferred<{ default: Record<string, string> }>();
    mockCdnErrorResponse("en", "default", 503, "Unavailable");

    const cleanup = await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: {
        en: () => {
          fallbackStarted.resolve();
          return fallbackResult.promise;
        },
      },
      onLoadError,
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    await fallbackStarted.promise;
    (cleanup as () => void)();
    fallbackResult.reject(new Error("Fallback failed"));

    await expect(pending).rejects.toThrow(CDN_ABORTED);
    expect(onLoadError).not.toHaveBeenCalled();
  });
});

describe("FetchLoader() in CDN mode error classification", () => {
  it("treats a transport-level AbortError as a cancellation, not a load failure", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError })(i18n);

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(CDN_ABORTED);
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("rejects with the fallback's failure, reported once, when both the CDN and the fallback fail", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    mockCdnErrorResponse("en", "default", 500, "Server Error");

    await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: { en: () => Promise.reject(new Error("Fallback failed")) },
      onLoadError,
    })(i18n);

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow("Fallback failed");
    expect(onLoadError).toHaveBeenCalledExactlyOnceWith(
      "en",
      "default",
      expect.objectContaining({ message: "Fallback failed" }),
    );
  });
});
