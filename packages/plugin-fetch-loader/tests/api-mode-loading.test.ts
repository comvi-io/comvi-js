/**
 * The API branch of the plugin (an apiKey is present): one request per locale +
 * namespace set, per-namespace success reporting, and the fallback rules that
 * apply when the response does not carry a namespace.
 */
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { FetchLoader } from "../src/index";
import type { TranslationValue } from "@comvi/core";
import { I18n } from "./helpers/composedHost";
import { deferred } from "./helpers/deferred";
import { stubFetchWithDeferredBody } from "./helpers/transport";
import {
  server,
  createMockApiResponse,
  mockApiErrorResponse,
  TEST_API_KEY,
  TEST_CDN_URL,
} from "./setup";

const FALLBACK_ABORTED = "[FetchLoader] Request aborted: API translation fallback";

const devHost = () => new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });

/** Answers /v1/translations with the namespaces the request asked for. */
function mockApiEchoingRequestedNamespaces(available: Record<string, Record<string, string>>): {
  requests: string[];
} {
  const requests: string[] = [];
  server.use(
    http.get(/\/v1\/translations/, ({ request }) => {
      const asked = (new URL(request.url).searchParams.get("namespaces") ?? "").split(",");
      requests.push(asked.join(","));
      const served = asked.filter((ns) => ns in available);
      return HttpResponse.json(
        createMockApiResponse(
          ["en"],
          served,
          Object.fromEntries(served.map((ns) => [ns, { en: available[ns] }])),
        ),
      );
    }),
  );
  return { requests };
}

describe("FetchLoader() in API mode", () => {
  it("makes one request for two concurrent loads of the same namespace", async () => {
    const i18n = devHost();
    const { requests } = mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);
    const load = i18n.getLoader()!;
    const both = await Promise.all([load("en", "default"), load("en", "default")]);

    expect(both).toEqual([{ hello: "Hi" }, { hello: "Hi" }]);
    expect(requests).toEqual(["default"]);
  });

  it("reports success only for the namespaces the response carried", async () => {
    const i18n = devHost();
    const onLoadSuccess = vi.fn();
    i18n.addTranslations({ "fr:dashboard": { title: "Tableau" } });
    mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadSuccess })(i18n);
    await i18n.getLoader()!("en", "default");

    expect(onLoadSuccess).toHaveBeenCalledExactlyOnceWith("en", "default");
  });

  it("loads the namespaces already active on the host rather than the default one", async () => {
    const i18n = devHost();
    i18n.addTranslations({ "fr:dashboard": { title: "Tableau" } });
    mockApiEchoingRequestedNamespaces({ dashboard: { title: "Dashboard" } });

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true })(i18n);

    expect(i18n.t("title", { ns: "dashboard" })).toBe("Dashboard");
  });

  it("adds the namespaces the response carried and leaves out the ones it omitted", async () => {
    const i18n = devHost();
    i18n.addTranslations({
      "fr:dashboard": { title: "Tableau" },
      "fr:default": { hello: "Salut" },
    });
    mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true })(i18n);

    expect([i18n.hasLocale("en", "default"), i18n.hasLocale("en", "dashboard")]).toEqual([
      true,
      false,
    ]);
  });
});

describe("FetchLoader() in API mode fallbacks", () => {
  it("falls back to the local import for a namespace the response omits", async () => {
    const i18n = devHost();
    mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: { "en:missing": () => Promise.resolve({ default: { key: "Offline" } }) },
    })(i18n);

    await expect(i18n.getLoader()!("en", "missing")).resolves.toEqual({ key: "Offline" });
  });

  it("reports the missing-namespace error, not the failure of its fallback", async () => {
    const i18n = devHost();
    const onLoadError = vi.fn();
    mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: { "en:missing": () => Promise.reject(new Error("Offline import failed")) },
      onLoadError,
    })(i18n);

    await expect(i18n.getLoader()!("en", "missing")).rejects.toThrow(
      "[FetchLoader] No translations found for en:missing",
    );
    expect(onLoadError).toHaveBeenCalledExactlyOnceWith(
      "en",
      "missing",
      expect.objectContaining({ message: "[FetchLoader] No translations found for en:missing" }),
    );
  });

  it("attempts a failing fallback once when the API request also failed", async () => {
    const i18n = devHost();
    const fallback = vi.fn(() => Promise.reject(new Error("Fallback failed")));
    mockApiErrorResponse(500, "Server Error");

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, fallback: { en: fallback } })(
      i18n,
    );

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(
      "[FetchLoader] No translations found for en:default",
    );
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("attempts a fallback that resolves without translations only once", async () => {
    const i18n = devHost();
    const empty = { default: undefined as unknown as Record<string, TranslationValue> };
    const fallback = vi.fn(() => Promise.resolve(empty));
    mockApiErrorResponse(500, "Server Error");

    await FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, fallback: { en: fallback } })(
      i18n,
    );

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(
      "[FetchLoader] No translations found for en:default",
    );
    expect(fallback).toHaveBeenCalledOnce();
  });
});

describe("FetchLoader() in API mode after cleanup", () => {
  it("discards a response whose body arrives after cleanup", async () => {
    const i18n = devHost();
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
    response.resolve(createMockApiResponse(["en"], ["default"]));

    await expect(pending).rejects.toThrow("[FetchLoader] Request aborted: API translations");
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

  it("does not reach for the fallback when the response fails after cleanup", async () => {
    const i18n = devHost();
    const fallback = vi.fn(() => Promise.resolve({ default: { hello: "Offline" } }));
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

    await expect(pending).rejects.toThrow("[FetchLoader] Request aborted: API translations");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("discards a fallback that resolves after cleanup", async () => {
    const i18n = devHost();
    const onLoadSuccess = vi.fn();
    const started = deferred<void>();
    const result = deferred<{ default: Record<string, string> }>();
    mockApiErrorResponse(500, "Server Error");

    const cleanup = await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      onLoadSuccess,
      fallback: {
        en: () => {
          started.resolve();
          return result.promise;
        },
      },
    })(i18n);
    const pending = i18n.getLoader()!("en", "default");
    await started.promise;
    (cleanup as () => void)();
    result.resolve({ default: { key: "Offline" } });

    await expect(pending).rejects.toThrow(FALLBACK_ABORTED);
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

  it("discards a missing-namespace fallback that resolves after cleanup", async () => {
    const i18n = devHost();
    const started = deferred<void>();
    const result = deferred<{ default: Record<string, string> }>();
    mockApiEchoingRequestedNamespaces({ default: { hello: "Hi" } });

    const cleanup = await FetchLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: {
        "en:missing": () => {
          started.resolve();
          return result.promise;
        },
      },
    })(i18n);
    const pending = i18n.getLoader()!("en", "missing");
    await started.promise;
    (cleanup as () => void)();
    result.resolve({ default: { key: "Offline" } });

    await expect(pending).rejects.toThrow(FALLBACK_ABORTED);
  });
});
