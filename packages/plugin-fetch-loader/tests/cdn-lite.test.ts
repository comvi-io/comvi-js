/**
 * `@comvi/plugin-fetch-loader/cdn` — the CDN-only installer.
 *
 * Same CDN behaviour as `fetchLoader()` minus the API request path: the URL
 * shape, the body timeout, the fallback map and the cleared-scope abort are all
 * pinned here through the `/cdn` entry's own module graph, so a change that
 * quietly routes this subpath back through the full loader shows up as a
 * behaviour test, not only as a size row.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { createI18n, hasLoaderApi } from "@comvi/core";
import type { I18nPlugin } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { CdnLoader, cdnLoader, type CdnLoaderOptions } from "../src/cdn/index";
import { FETCH_LOADER_PLUGIN_KEY } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { asFetch } from "./helpers/transport";
import {
  server,
  mockCdnDeferredResponse,
  mockCdnErrorResponse,
  mockCdnSuccessResponse,
  TEST_CDN_URL,
} from "./setup";

const base = () => createI18n({ locale: "en", exposeGlobal: false, devMode: false });
const TIMEOUT_MS = 50;

describe("cdnLoader() installer", () => {
  it("composes both capabilities and loads the initial namespace from the CDN", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    const i18n = base().with(cdnLoader({ cdnUrl: TEST_CDN_URL }));
    await i18n.init();

    expect(i18n.t("greeting")).toBe("Hello");
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toMatchObject({ cdnUrl: TEST_CDN_URL });

    await i18n.destroy();
  });

  it("reloads through the registered loader when the locale changes", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    mockCdnSuccessResponse("fr", "default", { greeting: "Bonjour" });

    const i18n = base().with(cdnLoader({ cdnUrl: TEST_CDN_URL }));
    await i18n.init();
    await i18n.setLocaleAsync("fr");

    expect(i18n.t("greeting")).toBe("Bonjour");

    await i18n.destroy();
  });

  it("reports a missing cdnUrl at COMPOSITION time, not at init", () => {
    expect(() => base().with(cdnLoader({ cdnUrl: "" }))).toThrow(/cdnUrl is required/);
  });

  it("fails at init through .use(), before either capability is attached", async () => {
    const i18n = base().with(plugins());
    i18n.use(cdnLoader({ cdnUrl: TEST_CDN_URL }) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/cdnLoader\(\) is a \.with\(…\) installer/);

    expect(hasLoaderApi(i18n)).toBe(false);
  });
});

describe("CdnLoader() options guard", () => {
  it("reports a missing cdnUrl when the options object carries none", () => {
    expect(() => CdnLoader({} as CdnLoaderOptions)).toThrow("[FetchLoader] cdnUrl is required");
  });

  it("reports a missing cdnUrl when no options are passed at all", () => {
    expect(() => CdnLoader(undefined as unknown as CdnLoaderOptions)).toThrow(
      "[FetchLoader] cdnUrl is required",
    );
  });
});

describe("CdnLoader() plugin", () => {
  it("loads the initial namespace when loadOnInit is left at its default", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    await CdnLoader({ cdnUrl: TEST_CDN_URL })(i18n);

    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("makes no request at install time when loadOnInit is false", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    let requests = 0;
    server.use(
      http.get(`${TEST_CDN_URL}/en.json`, () => {
        requests++;
        return HttpResponse.json({ greeting: "Hello" });
      }),
    );

    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);

    expect(requests).toBe(0);
  });

  it("loads the namespaces already active on the host rather than the default one", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    i18n.addTranslations({ "fr:dashboard": { title: "Tableau" } });
    server.use(
      http.get(`${TEST_CDN_URL}/dashboard/en.json`, () =>
        HttpResponse.json({ title: "Dashboard" }),
      ),
    );

    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true })(i18n);

    expect(i18n.t("title", { ns: "dashboard" })).toBe("Dashboard");
  });

  it("loads a non-default namespace from its own CDN folder", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    server.use(
      http.get(`${TEST_CDN_URL}/dashboard/en.json`, () => HttpResponse.json({ title: "Board" })),
    );

    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);

    await expect(i18n.getLoader()!("en", "dashboard")).resolves.toEqual({ title: "Board" });
  });

  it("puts the namespace named by cdnLayout.rootNamespace at the CDN root", async () => {
    const i18n = new I18n({ locale: "en", defaultNs: "storefront", devMode: false });
    server.use(http.get(`${TEST_CDN_URL}/en.json`, () => HttpResponse.json({ title: "Shop" })));

    await CdnLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      cdnLayout: { rootNamespace: "default" },
    })(i18n);

    await expect(i18n.getLoader()!("en", "default")).resolves.toEqual({ title: "Shop" });
  });

  it("rejects a namespace that is not a safe URL path segment", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });

    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);

    await expect(i18n.getLoader()!("en", "../secrets")).rejects.toThrow(
      /Invalid namespace: "\.\.\/secrets"/,
    );
  });
});

describe("CdnLoader() body timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out a body that never arrives and reports it through onLoadError", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      asFetch(
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: new Headers(),
            json: () => new Promise<never>(() => {}),
          } as unknown as Response),
        ),
      ),
    );
    const onLoadError = vi.fn();
    const i18n = new I18n({ locale: "en", devMode: false });

    await CdnLoader({
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
});

describe("CdnLoader() when the CDN refuses", () => {
  it("serves the fallback import and reports the success, not the failure", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    const onLoadSuccess = vi.fn();
    mockCdnErrorResponse("en", "default", 503, "Unavailable");

    await CdnLoader({
      cdnUrl: TEST_CDN_URL,
      loadOnInit: false,
      fallback: { en: () => Promise.resolve({ default: { greeting: "Offline" } }) },
      onLoadError,
      onLoadSuccess,
    })(i18n);

    await expect(i18n.getLoader()!("en", "default")).resolves.toEqual({ greeting: "Offline" });
    expect(onLoadError).not.toHaveBeenCalled();
    expect(onLoadSuccess).toHaveBeenCalledWith("en", "default");
  });

  it("reports the HTTP failure through onLoadError when no fallback covers the key", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    mockCdnErrorResponse("en", "default", 503, "Unavailable");

    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError })(i18n);

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(
      "HTTP 503: Service Unavailable",
    );
    expect(onLoadError).toHaveBeenCalledWith(
      "en",
      "default",
      expect.objectContaining({ message: "HTTP 503: Service Unavailable" }),
    );
  });
});

/**
 * J1: `clearTranslations()` drops the matching pending loads inside core before
 * it announces the clear, so the plugin releases exactly those sockets — and
 * only those.
 */
describe("CdnLoader() and a cleared scope", () => {
  it("aborts an in-flight load whose own scope is cleared, with no load error", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const onLoadError = vi.fn();
    const response = mockCdnDeferredResponse("en", "default");
    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError })(i18n);
    const pendingLoad = i18n.getLoader()!("en", "default");
    await response.requested;

    i18n.clearTranslations("en", "default");

    await expect(pendingLoad).rejects.toThrow(/aborted/i);
    expect(onLoadError).not.toHaveBeenCalled();
  }, 2000);

  it("leaves an in-flight load for another locale running", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    const response = mockCdnDeferredResponse("en", "default");
    await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);
    const pendingLoad = i18n.getLoader()!("en", "default");
    await response.requested;

    i18n.clearTranslations("fr", "default");

    response.resolve({ greeting: "Hello" });
    await expect(pendingLoad).resolves.toEqual({ greeting: "Hello" });
  }, 2000);

  it("makes no request for a load started after cleanup", async () => {
    const i18n = new I18n({ locale: "en", devMode: false });
    let requests = 0;
    server.use(
      http.get(`${TEST_CDN_URL}/en.json`, () => {
        requests++;
        return HttpResponse.json({ greeting: "Hello" });
      }),
    );

    const cleanup = await CdnLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false })(i18n);
    (cleanup as () => void)();

    await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(/aborted/i);
    expect(requests).toBe(0);
  });
});
