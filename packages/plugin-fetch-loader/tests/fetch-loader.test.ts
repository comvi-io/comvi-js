import { afterEach, describe, it, expect, vi } from "vitest";
import { FetchLoader, buildCdnUrl, buildApiExportUrl } from "../src/index";
import { I18n } from "./helpers/composedHost";
import { http, HttpResponse } from "msw";
import {
  server,
  buildTestCdnUrl,
  captureCdnRequest,
  createMockTranslations,
  createMockApiResponse,
  mockCdnSuccessResponse,
  mockCdnErrorResponse,
  mockCdnDeferredResponse,
  mockCdnNetworkError,
  mockApiSuccessResponse,
  mockApiErrorResponse,
  TEST_CDN_URL,
  TEST_API_KEY,
} from "./setup";

describe("FetchLoader Plugin", () => {
  describe("Configuration validation", () => {
    it("should throw error if cdnUrl is not provided", () => {
      expect(() => FetchLoader({} as any)).toThrow("[FetchLoader] cdnUrl is required");
    });

    it("should throw error if options are undefined", () => {
      expect(() => FetchLoader(undefined as any)).toThrow("[FetchLoader] cdnUrl is required");
    });

    it("should accept minimal valid configuration", async () => {
      const i18n = new I18n({ locale: "en", devMode: false });
      mockCdnSuccessResponse("en", "default", { hello: "Hello" });

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(i18n.t("hello")).toBe("Hello");
    });
  });

  describe("CDN URL layout", () => {
    it.each([
      ["no layout: the consumer default lands at the root", "forest", undefined, "de.json"],
      ["no layout: any other namespace lands in its folder", "badge", undefined, "badge/de.json"],
      [
        "rootNamespace false: the consumer default lands in its folder",
        "forest",
        { rootNamespace: false as const },
        "forest/de.json",
      ],
      [
        "rootNamespace false: any other namespace lands in its folder",
        "badge",
        { rootNamespace: false as const },
        "badge/de.json",
      ],
      [
        'rootNamespace "default": the consumer default lands in its folder',
        "forest",
        { rootNamespace: "default" },
        "forest/de.json",
      ],
      [
        'rootNamespace "default": the CDN root namespace lands at the root',
        "default",
        { rootNamespace: "default" },
        "de.json",
      ],
    ])("%s", (_label, namespace, layout, expectedPath) => {
      expect(buildCdnUrl(TEST_CDN_URL, "de", namespace, "forest", layout)).toBe(
        `${TEST_CDN_URL}/${expectedPath}`,
      );
    });

    it("loads the consumer default from its folder when the CDN root differs", async () => {
      const i18n = new I18n({ locale: "de", defaultNs: "forest", devMode: false });
      mockCdnSuccessResponse("de", "forest", { greeting: "Hallo" });

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        cdnLayout: { rootNamespace: "default" },
      });
      await plugin(i18n);

      expect(i18n.t("greeting")).toBe("Hallo");
    });
  });

  describe("Input validation", () => {
    it("should reject locale with path traversal characters", () => {
      expect(() => buildCdnUrl(TEST_CDN_URL, "../etc", "default", "default")).toThrow(
        '[FetchLoader] Invalid locale: "../etc"',
      );
    });

    it("should reject namespace with path traversal characters", () => {
      expect(() => buildCdnUrl(TEST_CDN_URL, "en", "../../secret", "default")).toThrow(
        '[FetchLoader] Invalid namespace: "../../secret"',
      );
    });

    it.each([".", ".."])('should reject the locale dot-segment "%s"', (locale) => {
      expect(() => buildCdnUrl(TEST_CDN_URL, locale, "default", "default")).toThrow(
        `[FetchLoader] Invalid locale: "${locale}"`,
      );
    });

    it.each([".", ".."])('should reject the namespace dot-segment "%s"', (namespace) => {
      expect(() => buildCdnUrl(TEST_CDN_URL, "en", namespace, "default")).toThrow(
        `[FetchLoader] Invalid namespace: "${namespace}"`,
      );
    });

    it.each([".", ".."])(
      'should reject the CDN root namespace dot-segment "%s"',
      (rootNamespace) => {
        expect(() =>
          buildCdnUrl(TEST_CDN_URL, "en", "default", "default", { rootNamespace }),
        ).toThrow(`[FetchLoader] Invalid CDN root namespace: "${rootNamespace}"`);
      },
    );

    it("should reject empty locale", () => {
      expect(() => buildCdnUrl(TEST_CDN_URL, "", "default", "default")).toThrow(
        "[FetchLoader] Invalid locale",
      );
    });

    it("should reject locale with spaces", () => {
      expect(() => buildCdnUrl(TEST_CDN_URL, "en US", "default", "default")).toThrow(
        "[FetchLoader] Invalid locale",
      );
    });

    it.each([
      ["en", "default", "en.json"],
      ["en-US", "default", "en-US.json"],
      ["zh_TW", "default", "zh_TW.json"],
      ["pt-BR", "ns", "ns/pt-BR.json"],
    ])('should accept the valid locale "%s" in namespace "%s"', (locale, namespace, path) => {
      expect(buildCdnUrl(TEST_CDN_URL, locale, namespace, "default")).toBe(
        `${TEST_CDN_URL}/${path}`,
      );
    });

    it.each(["common", "my-namespace", "ns_v2", "@scope.pkg"])(
      'should accept the valid namespace identifier "%s"',
      (namespace) => {
        expect(buildCdnUrl(TEST_CDN_URL, "en", namespace, "default")).toBe(
          `${TEST_CDN_URL}/${namespace}/en.json`,
        );
      },
    );

    it("should validate locale in buildApiExportUrl", () => {
      expect(() => buildApiExportUrl(1, "../hack", ["default"])).toThrow(
        "[FetchLoader] Invalid locale",
      );
    });

    it("should validate namespaces in buildApiExportUrl", () => {
      expect(() => buildApiExportUrl(1, "en", ["valid", "../hack"])).toThrow(
        "[FetchLoader] Invalid namespace",
      );
    });

    it("should build the export URL with locale and namespaces as query params", () => {
      expect(buildApiExportUrl(42, "en", ["default", "dashboard"], "https://api.example.com")).toBe(
        "https://api.example.com/v1/projects/42/export?locales=en&namespaces=default%2Cdashboard",
      );
    });
  });

  describe("Production Mode (CDN loading)", () => {
    describe("URL building", () => {
      it("should fetch from {cdnUrl}/{lang}.json for default namespace", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const request = captureCdnRequest("en", "default", createMockTranslations("en"));

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(request.url).toBe(`${TEST_CDN_URL}/en.json`);
      });

      it("should fetch from {cdnUrl}/{ns}/{lang}.json for non-default namespace", async () => {
        const i18n = new I18n({ locale: "en", defaultNs: "common", devMode: false });
        mockCdnSuccessResponse("en", "common", {}, "common");
        const request = captureCdnRequest("en", "dashboard", { title: "Dashboard" }, "common");

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);
        await i18n.addActiveNamespace("dashboard");

        expect(request.url).toBe(`${TEST_CDN_URL}/dashboard/en.json`);
      });
    });

    describe("Authentication", () => {
      it("should not add Authorization header for CDN requests", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const request = captureCdnRequest("en", "default", { key: "value" });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(request.headers?.get("Authorization")).toBeNull();
      });

      it("should add Accept: application/json header", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const request = captureCdnRequest("en", "default", { key: "value" });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(request.headers?.get("Accept")).toBe("application/json");
      });
    });

    describe("Request deduplication", () => {
      it("should make only one request for concurrent loads of the same key", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        let requestCount = 0;

        server.use(
          http.get(`${TEST_CDN_URL}/en.json`, () => {
            requestCount++;
            return HttpResponse.json({ key: "value" });
          }),
        );

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
        await plugin(i18n);

        const loaderFn = i18n.getLoader()!;
        await Promise.all([
          loaderFn("en", "default"),
          loaderFn("en", "default"),
          loaderFn("en", "default"),
        ]);

        expect(requestCount).toBe(1);
      });

      it("should allow new request after previous one completes", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        let requestCount = 0;

        server.use(
          http.get(`${TEST_CDN_URL}/en.json`, () => {
            requestCount++;
            return HttpResponse.json({ key: "value" });
          }),
        );

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
        await plugin(i18n);

        const loaderFn = i18n.getLoader()!;
        await loaderFn("en", "default");
        await loaderFn("en", "default");

        expect(requestCount).toBe(2);
      });

      it("should make separate requests for different languages", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", { key: "Hello" });
        mockCdnSuccessResponse("fr", "default", { key: "Bonjour" });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
        await plugin(i18n);

        const loaderFn = i18n.getLoader()!;
        const [enResult, frResult] = await Promise.all([
          loaderFn("en", "default"),
          loaderFn("fr", "default"),
        ]);

        expect(enResult).toEqual({ key: "Hello" });
        expect(frResult).toEqual({ key: "Bonjour" });
      });
    });

    describe("Timeout handling", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it("should report timeout error when request exceeds duration", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const i18n = new I18n({ locale: "en", devMode: false });
        const onLoadError = vi.fn();
        const response = mockCdnDeferredResponse("en", "default");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          timeout: 50,
          loadOnInit: true,
          onLoadError,
        });
        const pending = plugin(i18n);
        await response.requested;
        await vi.advanceTimersByTimeAsync(51);
        await pending;

        expect(onLoadError).toHaveBeenCalledExactlyOnceWith(
          "en",
          "default",
          expect.objectContaining({ message: expect.stringContaining("timeout") }),
        );
      });

      it("should succeed when request completes within timeout", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const response = mockCdnDeferredResponse("en", "default");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          timeout: 200,
          loadOnInit: true,
        });
        const pending = plugin(i18n);
        await response.requested;
        response.resolve({ key: "value" });
        await pending;

        expect(i18n.t("key")).toBe("value");
      });
    });

    describe("Error handling", () => {
      it("should call onLoadError with status code on HTTP error", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const onLoadError = vi.fn();

        mockCdnErrorResponse("en", "default", 404, "Not Found");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          onLoadError,
        });

        await plugin(i18n);

        expect(onLoadError).toHaveBeenCalledWith("en", "default", expect.any(Error));
        expect(onLoadError.mock.lastCall?.[2]).toHaveProperty(
          "message",
          expect.stringContaining("404"),
        );
      });

      it("should call onLoadError on network error", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const onLoadError = vi.fn();

        mockCdnNetworkError("en", "default");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          onLoadError,
        });

        await plugin(i18n);

        expect(onLoadError).toHaveBeenCalledWith("en", "default", expect.any(Error));
      });

      it("should call onLoadSuccess after successful load", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const onLoadSuccess = vi.fn();

        mockCdnSuccessResponse("en", "default", { key: "value" });

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          onLoadSuccess,
        });

        await plugin(i18n);

        expect(onLoadSuccess).toHaveBeenCalledWith("en", "default");
      });
    });

    describe("Fallback", () => {
      it("should use exact key fallback when fetch fails", async () => {
        const i18n = new I18n({ locale: "en", defaultNs: "common", devMode: false });
        const fallbackData = { greeting: "Fallback hello" };

        mockCdnErrorResponse("en", "common", 404, "Not Found", "common");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          fallback: {
            "en:common": () => Promise.resolve({ default: fallbackData }),
          },
        });

        await plugin(i18n);

        expect(i18n.t("greeting")).toBe("Fallback hello");
      });

      it("should use shorthand key fallback for default namespace", async () => {
        const i18n = new I18n({ locale: "en", defaultNs: "common", devMode: false });
        const fallbackData = { greeting: "Shorthand fallback" };

        mockCdnErrorResponse("en", "common", 404, "Not Found", "common");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          fallback: {
            en: () => Promise.resolve({ default: fallbackData }),
          },
        });

        await plugin(i18n);

        expect(i18n.t("greeting")).toBe("Shorthand fallback");
      });

      it("should prefer exact key over shorthand", async () => {
        const i18n = new I18n({ locale: "en", defaultNs: "common", devMode: false });

        mockCdnErrorResponse("en", "common", 404, "Not Found", "common");

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          fallback: {
            "en:common": () => Promise.resolve({ default: { key: "Exact" } }),
            en: () => Promise.resolve({ default: { key: "Shorthand" } }),
          },
        });

        await plugin(i18n);

        expect(i18n.t("key")).toBe("Exact");
      });

      it("should not use fallback when fetch succeeds", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const fallbackFn = vi.fn();

        mockCdnSuccessResponse("en", "default", { key: "CDN value" });

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          fallback: { en: fallbackFn },
        });

        await plugin(i18n);

        expect(fallbackFn).not.toHaveBeenCalled();
      });

      it("should call onLoadError when both fetch and fallback fail", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });
        const onLoadError = vi.fn();

        mockCdnErrorResponse("en", "default", 404);

        const plugin = FetchLoader({
          cdnUrl: TEST_CDN_URL,
          loadOnInit: true,
          fallback: {
            en: () => Promise.reject(new Error("Fallback failed")),
          },
          onLoadError,
        });

        await plugin(i18n);

        expect(onLoadError).toHaveBeenCalledWith(
          "en",
          "default",
          expect.objectContaining({ message: expect.stringContaining("Fallback failed") }),
        );
      });
    });

    describe("loadOnInit", () => {
      it("should not load translations when loadOnInit is false", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", { key: "value" });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
        await plugin(i18n);

        expect(i18n.hasLocale("en", "default")).toBe(false);
      });

      it("should use custom defaultNs for init load", async () => {
        const i18n = new I18n({ locale: "en", defaultNs: "main", devMode: false });

        mockCdnSuccessResponse("en", "main", { greeting: "Hello" }, "main");

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(i18n.hasLocale("en", "main")).toBe(true);
      });
    });

    describe("Translation data", () => {
      it("should make translations accessible via t()", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", {
          greeting: "Hello",
          farewell: "Goodbye",
          "nested.welcome": "Welcome!",
        });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(i18n.t("greeting")).toBe("Hello");
        expect(i18n.t("farewell")).toBe("Goodbye");
        expect(i18n.t("nested.welcome")).toBe("Welcome!");
      });

      it("should handle empty translation object", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", {});

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(i18n.hasLocale("en", "default")).toBe(true);
      });

      it("should flatten deeply nested translation objects", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", {
          level1: { level2: { level3: { deep: "Deep value" } } },
        });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        await plugin(i18n);

        expect(i18n.t("level1.level2.level3.deep")).toBe("Deep value");
      });
    });

    describe("Cleanup", () => {
      it("should return cleanup function in CDN mode", async () => {
        const i18n = new I18n({ locale: "en", devMode: false });

        mockCdnSuccessResponse("en", "default", { key: "value" });

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        const cleanup = await plugin(i18n);

        expect(typeof cleanup).toBe("function");
      });

      it("should return cleanup function in dev mode", async () => {
        const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });

        server.use(
          http.get(/\/v1\/translations/, () =>
            HttpResponse.json(createMockApiResponse(["en"], ["default"])),
          ),
        );

        const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
        const cleanup = await plugin(i18n);

        expect(typeof cleanup).toBe("function");
      });
    });
  });

  describe("API loading", () => {
    it("should add Bearer token for API requests", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY });
      let receivedHeaders: Headers | undefined;

      server.use(
        http.get(/\/v1\/translations/, ({ request }) => {
          receivedHeaders = request.headers;
          return HttpResponse.json(createMockApiResponse(["en"], ["default"]));
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(receivedHeaders?.get("Authorization")).toBe(`Bearer ${TEST_API_KEY}`);
    });

    it("should use API when apiKey is present even without devMode", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: false });
      let apiRequestCount = 0;
      let cdnRequestCount = 0;

      server.use(
        http.get(/\/v1\/translations/, () => {
          apiRequestCount++;
          return HttpResponse.json(
            createMockApiResponse(["en"], ["default"], {
              default: { en: { hello: "Hello from API" } },
            }),
          );
        }),
        http.get(buildTestCdnUrl("en", "default"), () => {
          cdnRequestCount++;
          return HttpResponse.json({ hello: "Hello from CDN" });
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(apiRequestCount).toBe(1);
      expect(cdnRequestCount).toBe(0);
      expect(i18n.t("hello")).toBe("Hello from API");
    });

    it("should use CDN mode without apiKey even in devMode", async () => {
      const i18n = new I18n({ locale: "en", devMode: true });
      let cdnRequestCount = 0;

      server.use(
        http.get(buildTestCdnUrl("en", "default"), () => {
          cdnRequestCount++;
          return HttpResponse.json({ hello: "Hello from CDN" });
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(cdnRequestCount).toBe(1);
      expect(i18n.t("hello")).toBe("Hello from CDN");
    });

    it("should send API requests to an explicit baseUrl", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY });
      let requestedUrl: string | undefined;

      server.use(
        http.get("https://explicit.example.com/v1/translations", ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json(
            createMockApiResponse(["en"], ["default"], {
              default: { en: { hello: "Hello from explicit host" } },
            }),
          );
        }),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        baseUrl: "https://explicit.example.com",
        loadOnInit: true,
      });
      await plugin(i18n);

      expect(requestedUrl).toContain("https://explicit.example.com/v1/translations");
      expect(i18n.t("hello")).toBe("Hello from explicit host");
    });

    it("should prefer baseUrl over the legacy apiBaseUrl option", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY });
      let explicitRequests = 0;
      let legacyRequests = 0;

      server.use(
        http.get("https://explicit.example.com/v1/translations", () => {
          explicitRequests++;
          return HttpResponse.json(createMockApiResponse(["en"], ["default"]));
        }),
        http.get("https://legacy.example.com/v1/translations", () => {
          legacyRequests++;
          return HttpResponse.json(createMockApiResponse(["en"], ["default"]));
        }),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        baseUrl: "https://explicit.example.com",
        apiBaseUrl: "https://legacy.example.com",
        loadOnInit: true,
      });
      await plugin(i18n);

      expect(explicitRequests).toBe(1);
      expect(legacyRequests).toBe(0);
    });

    it("should load all namespaces in a single API request", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      let requestCount = 0;

      server.use(
        http.get(/\/v1\/translations/, () => {
          requestCount++;
          return HttpResponse.json(createMockApiResponse(["en"], ["default"]));
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(requestCount).toBe(1);
    });

    it("should transform API response and make translations accessible", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });

      const apiResponse = createMockApiResponse(["en"], ["default"], {
        default: { en: { greeting: "Hello from API" } },
      });

      mockApiSuccessResponse(apiResponse);

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true });
      await plugin(i18n);

      expect(i18n.t("greeting")).toBe("Hello from API");
    });

    it("should call onLoadError for each namespace when API fails", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      const onLoadError = vi.fn();

      mockApiErrorResponse(500, "Server Error");

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        onLoadError,
      });

      await plugin(i18n);

      expect(onLoadError).toHaveBeenCalledWith("en", "default", expect.any(Error));
    });

    it("should use fallback when API fails", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });

      mockApiErrorResponse(500, "Server Error");

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        fallback: {
          en: () => Promise.resolve({ default: { key: "Fallback value" } }),
        },
      });

      await plugin(i18n);

      const loaderFn = i18n.getLoader()!;
      const data = await loaderFn("en", "default");
      expect(data).toEqual({ key: "Fallback value" });
    });

    it("should use fallback when project info bootstrap fails", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      const onLoadError = vi.fn();

      server.use(
        http.get(/\/v1\/translations/, () => new HttpResponse("Not Found", { status: 404 })),
        http.get(/\/v1\/project$/, () => new HttpResponse("Unauthorized", { status: 401 })),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        fallback: {
          en: () => Promise.resolve({ default: { greeting: "Fallback hello" } }),
        },
        onLoadError,
      });

      await plugin(i18n);

      expect(i18n.t("greeting")).toBe("Fallback hello");
      expect(onLoadError).not.toHaveBeenCalled();
    });

    it("should dedupe concurrent project info bootstrap requests", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      let projectInfoRequests = 0;

      server.use(
        http.get(/\/v1\/translations/, () => new HttpResponse("Not Found", { status: 404 })),
        http.get(/\/v1\/project$/, () => {
          projectInfoRequests++;
          return HttpResponse.json({
            id: 456,
            organizationId: 1,
            name: "Test Project",
            description: "Project",
            sourceLocale: "en",
          });
        }),
        http.get(/\/v1\/projects\/.*\/export/, ({ request }) => {
          const namespaces = new URL(request.url).searchParams.get("namespaces");
          if (namespaces === "default") {
            return HttpResponse.json(
              createMockApiResponse(["en"], ["default"], {
                default: { en: { greeting: "Hello" } },
              }),
            );
          }
          if (namespaces === "dashboard") {
            return HttpResponse.json(
              createMockApiResponse(["en"], ["dashboard"], {
                dashboard: { en: { title: "Dashboard" } },
              }),
            );
          }
          return new HttpResponse("Unexpected namespaces", { status: 500 });
        }),
      );

      const plugin = FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false });
      await plugin(i18n);

      const loaderFn = i18n.getLoader()!;
      const [defaultData, dashboardData] = await Promise.all([
        loaderFn("en", "default"),
        loaderFn("en", "dashboard"),
      ]);

      expect(projectInfoRequests).toBe(1);
      expect(defaultData).toEqual({ greeting: "Hello" });
      expect(dashboardData).toEqual({ title: "Dashboard" });
    });

    it("should report a single error when API request and fallback both fail", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      const onLoadError = vi.fn();

      mockApiErrorResponse(500, "Server Error");

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: true,
        fallback: {
          en: () => Promise.reject(new Error("Fallback failed")),
        },
        onLoadError,
      });

      await plugin(i18n);

      expect(onLoadError).toHaveBeenCalledExactlyOnceWith(
        "en",
        "default",
        expect.objectContaining({ message: expect.stringContaining("Fallback failed") }),
      );
    });

    it("should call onLoadError when API response is missing the requested namespace", async () => {
      const i18n = new I18n({ locale: "en", apiKey: TEST_API_KEY, devMode: true });
      const onLoadError = vi.fn();

      server.use(
        http.get(/\/v1\/translations/, () =>
          HttpResponse.json(createMockApiResponse(["en"], ["default"])),
        ),
      );

      const plugin = FetchLoader({
        cdnUrl: TEST_CDN_URL,
        loadOnInit: false,
        onLoadError,
      });
      await plugin(i18n);

      const loaderFn = i18n.getLoader()!;
      await expect(loaderFn("en", "missing")).rejects.toThrow(
        "[FetchLoader] No translations found for en:missing",
      );

      expect(onLoadError).toHaveBeenCalledExactlyOnceWith(
        "en",
        "missing",
        expect.objectContaining({ message: expect.stringContaining("No translations found") }),
      );
    });
  });
});
