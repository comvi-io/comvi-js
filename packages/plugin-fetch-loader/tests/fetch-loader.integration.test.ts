import { describe, it, expect, vi } from "vitest";
import { FetchLoader, fetchProjectInfo, clearProjectInfoCache } from "../src/index";
import { I18n } from "@comvi/core";
import { delay, http, HttpResponse } from "msw";
import {
  server,
  createMockTranslations,
  createMockApiResponse,
  mockCdnSuccessResponse,
  mockCdnErrorResponse,
  TEST_CDN_URL,
  TEST_API_KEY,
} from "./setup";

describe("FetchLoader Integration Tests", () => {
  describe("Plugin lifecycle", () => {
    it("loads initial namespaces after later plugins have registered", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      let laterPluginRan = false;
      const namespaceLoadedAfterLaterPlugin: boolean[] = [];

      mockCdnSuccessResponse("en", "default", { key: "Hello" });
      i18n.on("namespaceLoaded", () => {
        namespaceLoadedAfterLaterPlugin.push(laterPluginRan);
      });

      i18n.use(FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true }));
      i18n.use(() => {
        laterPluginRan = true;
      });

      await i18n.init();

      expect(namespaceLoadedAfterLaterPlugin).toEqual([true]);
      expect(i18n.t("key")).toBe("Hello");
    });
  });

  describe("Auto-load on language change", () => {
    it("should load translations when language changes", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      mockCdnSuccessResponse("en", "default", { key: "Hello" });
      mockCdnSuccessResponse("fr", "default", { key: "Bonjour" });

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      i18n.locale = "fr";

      await expect.poll(() => i18n.hasLocale("fr", "default"), { timeout: 500 }).toBe(true);
    });

    it("should handle errors gracefully during auto-load", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      const onLoadError = vi.fn();

      mockCdnSuccessResponse("en", "default", { key: "Hello" });
      mockCdnErrorResponse("fr", "default", 404, "Not Found");

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        onLoadError,
      });

      await plugin(i18n);
      i18n.locale = "fr";

      await expect.poll(() => onLoadError.mock.calls.length > 0, { timeout: 500 }).toBe(true);
      expect(i18n.hasLocale("fr", "default")).toBe(false);
    });

    it("should handle sequential language changes", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      for (const lang of ["en", "fr", "de"]) {
        mockCdnSuccessResponse(lang, "default", createMockTranslations(lang, "default"));
      }

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      i18n.locale = "fr";
      await expect.poll(() => i18n.hasLocale("fr", "default"), { timeout: 500 }).toBe(true);

      i18n.locale = "de";
      await expect.poll(() => i18n.hasLocale("de", "default"), { timeout: 500 }).toBe(true);
    });
  });

  describe("Namespace management", () => {
    it("should load new namespace via addActiveNamespace", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      mockCdnSuccessResponse("en", "default", { key: "value" });
      server.use(
        http.get(`${TEST_CDN_URL}/dashboard/en.json`, () =>
          HttpResponse.json({ title: "Dashboard" }),
        ),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      await i18n.addActiveNamespace("dashboard");
      await expect.poll(() => i18n.hasLocale("en", "dashboard"), { timeout: 500 }).toBe(true);
    });

    it("should load all active namespaces when language changes", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      mockCdnSuccessResponse("en", "default", { key: "Hello" });
      server.use(
        http.get(`${TEST_CDN_URL}/errors/en.json`, () => HttpResponse.json({ error: "Error EN" })),
      );
      mockCdnSuccessResponse("fr", "default", { key: "Bonjour" });
      server.use(
        http.get(`${TEST_CDN_URL}/errors/fr.json`, () => HttpResponse.json({ error: "Erreur FR" })),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      await i18n.addActiveNamespace("errors");
      await expect.poll(() => i18n.hasLocale("en", "errors"), { timeout: 500 }).toBe(true);

      i18n.locale = "fr";
      await expect.poll(() => i18n.hasLocale("fr", "errors"), { timeout: 500 }).toBe(true);
    });
  });

  describe("Concurrent requests and race conditions", () => {
    it("should not make duplicate requests during rapid language switches", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      const requestCounts: Record<string, number> = { en: 0, fr: 0, de: 0 };

      for (const lang of ["en", "fr", "de"]) {
        server.use(
          http.get(`${TEST_CDN_URL}/${lang}.json`, () => {
            requestCounts[lang]++;
            return HttpResponse.json(createMockTranslations(lang, "default"));
          }),
        );
      }

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      i18n.locale = "fr";
      i18n.locale = "de";
      i18n.locale = "fr";

      await expect.poll(() => i18n.hasLocale("fr", "default"), { timeout: 500 }).toBe(true);

      expect(requestCounts.fr).toBeLessThanOrEqual(1);
      expect(requestCounts.de).toBeLessThanOrEqual(1);
    });

    it("aborts a stale in-flight load when the locale moves on", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      const onLoadSuccess = vi.fn();

      // Slow EN response
      server.use(
        http.get(`${TEST_CDN_URL}/en.json`, async () => {
          await delay(300);
          return HttpResponse.json({ key: "Hello" });
        }),
      );
      // Fast FR response
      mockCdnSuccessResponse("fr", "default", { key: "Bonjour" });

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadSuccess });
      await plugin(i18n);

      const loaderFn = i18n.getLoader()!;
      const enPromise = loaderFn("en", "default");

      // Change to FR while EN is still loading
      i18n.locale = "fr";

      await expect(enPromise).rejects.toThrow(/aborted/i);
      // the new locale still loads normally after the stale request was cancelled
      await expect(loaderFn("fr", "default")).resolves.toEqual({ key: "Bonjour" });
      expect(onLoadSuccess).not.toHaveBeenCalledWith("en", "default");
      expect(onLoadSuccess).toHaveBeenCalledWith("fr", "default");
    });

    it("aborts in-flight requests on plugin cleanup", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      const onLoadError = vi.fn();

      server.use(
        http.get(`${TEST_CDN_URL}/en.json`, async () => {
          await delay(300);
          return HttpResponse.json({ key: "Hello" });
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError });
      const cleanup = await plugin(i18n);

      const pendingLoad = i18n.getLoader()!("en", "default");
      (cleanup as () => void)();

      await expect(pendingLoad).rejects.toThrow(/aborted/i);
      expect(onLoadError).not.toHaveBeenCalled();
    });
  });

  describe("Malformed responses", () => {
    it("falls back when the CDN returns 200 with invalid JSON", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      server.use(
        http.get(
          `${TEST_CDN_URL}/en.json`,
          () =>
            new HttpResponse("{not json", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: false,
        fallback: { en: () => Promise.resolve({ default: { key: "Offline" } }) },
      });
      await plugin(i18n);

      await expect(i18n.getLoader()!("en", "default")).resolves.toEqual({ key: "Offline" });
    });

    it("reports a diagnosable error for invalid CDN JSON without fallback", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      const onLoadError = vi.fn();

      server.use(
        http.get(
          `${TEST_CDN_URL}/en.json`,
          () =>
            new HttpResponse("{not json", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError });
      await plugin(i18n);

      await expect(i18n.getLoader()!("en", "default")).rejects.toThrow(/Invalid JSON response/);
      expect(onLoadError).toHaveBeenCalledWith(
        "en",
        "default",
        expect.objectContaining({ message: expect.stringContaining("Invalid JSON response") }),
      );
    });

    it("reports a diagnosable error for invalid API JSON in dev mode", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      const onLoadError = vi.fn();

      server.use(
        http.get(
          /\/v1\/translations/,
          () =>
            new HttpResponse("{not json", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false, onLoadError });
      await plugin(i18n);

      await expect(i18n.getLoader()!("en", "default")).rejects.toThrow();
      expect(onLoadError).toHaveBeenCalledWith(
        "en",
        "default",
        expect.objectContaining({ message: expect.stringContaining("Invalid JSON response") }),
      );
    });
  });

  describe("SSR cache options", () => {
    it("passes cache options to the API path fetches", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });

      server.use(
        http.get(/\/v1\/translations/, () =>
          HttpResponse.json(createMockApiResponse(["en"], ["default"])),
        ),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: false,
        cache: { revalidate: 3600, tags: ["i18n"] },
      });
      await plugin(i18n);
      await i18n.getLoader()!("en", "default");

      const call = fetchSpy.mock.calls.find(([input]) =>
        String(input).includes("/v1/translations"),
      );
      expect(call?.[1]).toMatchObject({ next: { revalidate: 3600, tags: ["i18n"] } });
      fetchSpy.mockRestore();
    });
  });

  describe("Reload translations", () => {
    it("should refetch API translations during reloadTranslations in dev mode", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      let requestCount = 0;

      server.use(
        http.get(/\/v1\/translations/, () => {
          requestCount++;
          return HttpResponse.json(
            createMockApiResponse(["en"], ["default"], {
              default: {
                en: {
                  greeting: requestCount === 1 ? "Hello v1" : "Hello v2",
                },
              },
            }),
          );
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
      await plugin(i18n);

      await i18n.addActiveNamespace("default");
      expect(i18n.t("greeting")).toBe("Hello v1");

      await i18n.reloadTranslations("en", "default");

      expect(requestCount).toBe(2);
      expect(i18n.t("greeting")).toBe("Hello v2");
    });
  });

  describe("Fallback integration", () => {
    it("should use fallback for translations after CDN failure", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      mockCdnErrorResponse("en", "default", 503, "Service Unavailable");

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        fallback: {
          en: () => Promise.resolve({ default: { welcome: "Welcome from fallback" } }),
        },
        loadOnInit: true,
      });

      await plugin(i18n);

      expect(i18n.t("welcome")).toBe("Welcome from fallback");
    });

    it("should use fallback on subsequent language changes after CDN failure", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });

      mockCdnErrorResponse("en", "default", 500);
      mockCdnErrorResponse("fr", "default", 500);

      const fallbackFn = vi.fn().mockResolvedValue({ default: { key: "fallback" } });

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        fallback: { en: fallbackFn, fr: fallbackFn },
        loadOnInit: true,
      });

      await plugin(i18n);

      expect(fallbackFn).toHaveBeenCalledTimes(1);

      i18n.locale = "fr";

      await expect
        .poll(() => fallbackFn.mock.calls.length, { timeout: 500 })
        .toBeGreaterThanOrEqual(2);
    });
  });

  describe("fetchProjectInfo", () => {
    it("should timeout when API does not respond in time", async () => {
      clearProjectInfoCache();

      server.use(
        http.get(/\/v1\/project$/, async () => {
          await delay(500);
          return HttpResponse.json({});
        }),
      );

      await expect(fetchProjectInfo("test-key", undefined, 50)).rejects.toThrow(/timeout/i);
    });

    it("should succeed when API responds within timeout", async () => {
      clearProjectInfoCache();

      const projectInfo = {
        id: 1,
        organizationId: 1,
        name: "Test",
        description: "Test",
        sourceLocale: "en",
      };

      server.use(
        http.get(/\/v1\/project$/, async () => {
          await delay(10);
          return HttpResponse.json(projectInfo);
        }),
      );

      const result = await fetchProjectInfo("test-key", undefined, 200);
      expect(result.id).toBe(1);
    });

    it("should cache project info separately for each apiBaseUrl", async () => {
      clearProjectInfoCache();
      let apiARequests = 0;
      let apiBRequests = 0;

      server.use(
        http.get("https://api-a.example.com/v1/project", () => {
          apiARequests++;
          return HttpResponse.json({
            id: 1,
            organizationId: 1,
            name: "API A",
            description: "A",
            sourceLocale: "en",
          });
        }),
        http.get("https://api-b.example.com/v1/project", () => {
          apiBRequests++;
          return HttpResponse.json({
            id: 2,
            organizationId: 1,
            name: "API B",
            description: "B",
            sourceLocale: "en",
          });
        }),
      );

      const first = await fetchProjectInfo("shared-key", "https://api-a.example.com");
      const second = await fetchProjectInfo("shared-key", "https://api-b.example.com");

      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
      expect(apiARequests).toBe(1);
      expect(apiBRequests).toBe(1);
    });

    it("should fall back to legacy project info endpoint when /v1/project is unavailable", async () => {
      clearProjectInfoCache();

      server.use(
        http.get("https://legacy-api.example.com/v1/project", () => {
          return new HttpResponse("Not Found", { status: 404 });
        }),
        http.get("https://legacy-api.example.com/api/v1/api/project", () => {
          return HttpResponse.json({
            id: 9,
            organizationId: 1,
            name: "Legacy API",
            description: "Legacy",
            sourceLocale: "en",
          });
        }),
      );

      const result = await fetchProjectInfo("legacy-key", "https://legacy-api.example.com");

      expect(result.id).toBe(9);
    });
  });
});
