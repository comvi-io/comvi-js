import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/runtime/utils/runtime", () => ({
  isServer: vi.fn(() => false),
}));

import middleware from "../src/runtime/middleware/i18n.global";
import {
  resetMocks,
  setMockCookie,
  setMockRequestHeaders,
  setMockI18n,
  mockRuntimeConfig,
  getMockCookieOptions,
  getMockCookieWrites,
} from "./mocks/nuxt-app";
import { useCookie, useState } from "#app";
import { isServer } from "../src/runtime/utils/runtime";

const setServerMode = (value: boolean) => {
  (isServer as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);
};

interface RouteStub {
  path: string;
  fullPath: string;
  query?: Record<string, unknown>;
}

/**
 * The single cast in this file. `#app`'s shim types `defineNuxtRouteMiddleware`
 * as returning `unknown`, so the imported default export arrives without its
 * call signature; the middleware itself reads only these three route fields.
 */
const runMiddleware = (route: RouteStub) =>
  (middleware as (to: RouteStub) => Promise<unknown>)(route);

type DetectConfig = (typeof mockRuntimeConfig)["public"]["comvi"]["detectBrowserLanguage"];

const DETECT_SKELETON = {
  useCookie: true,
  cookieName: "i18n_locale",
  cookieMaxAge: 31536000,
  redirectOnFirstVisit: true,
} as const;

/** The mock's default detection config, with only the fields a test varies. */
const withDetect = (overrides: Record<string, unknown> = {}) => {
  mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
    ...DETECT_SKELETON,
    fallbackLocale: "en",
    ...overrides,
  } as DetectConfig;
};

describe("i18n middleware", () => {
  beforeEach(() => {
    resetMocks();
    setServerMode(false);
  });

  it("respects cookie locale on root path and preserves query/hash", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/",
      fullPath: "/?x=1#top",
    });

    expect(result).toEqual({ path: "/de?x=1#top", redirectCode: 302 });

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("treats non-root path with no prefix as default locale in as-needed mode, ignoring cookie", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about?x=1#top",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("removes default locale prefix in as-needed mode", async () => {
    const result = await runMiddleware({
      path: "/en/about",
      fullPath: "/en/about",
    });

    expect(result).toEqual({ path: "/about", redirectCode: 302 });
  });

  it("adds locale prefix in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about?x=1",
    });

    expect(result).toEqual({ path: "/en/about?x=1", redirectCode: 302 });
  });

  it("removes locale prefix in never mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await runMiddleware({
      path: "/de/about",
      fullPath: "/de/about",
    });

    expect(result).toEqual({ path: "/about", redirectCode: 302 });
  });

  it("ignores cookies when useCookie is false", async () => {
    withDetect({ useCookie: false });
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });

    expect(result).toBeUndefined();

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("updates i18n instance locale during middleware run", async () => {
    const mockLocale = { value: "en" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({
      locale: mockLocale,
      setLocale,
    });
    setMockCookie("i18n_locale", "de");

    await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(setLocale).toHaveBeenCalledWith("de");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("skips internal app and api paths", async () => {
    const apiResult = await runMiddleware({
      path: "/api/health",
      fullPath: "/api/health",
    });
    const nuxtResult = await runMiddleware({
      path: "/_nuxt/app.js",
      fullPath: "/_nuxt/app.js",
    });

    expect(apiResult).toBeUndefined();
    expect(nuxtResult).toBeUndefined();
  });

  it("does not skip routes that only start with /api prefix", async () => {
    const result = await runMiddleware({
      path: "/de/apix",
      fullPath: "/de/apix",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not skip dotted app routes", async () => {
    const result = await runMiddleware({
      path: "/de/john.doe",
      fullPath: "/de/john.doe",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not redirect when redirectOnFirstVisit is false and locale detected from header", async () => {
    setServerMode(true);
    withDetect({ useCookie: false, redirectOnFirstVisit: false });
    setMockRequestHeaders({
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    });

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("redirects root to detected Accept-Language locale in as-needed mode", async () => {
    setServerMode(true);
    withDetect({ useCookie: false });
    setMockRequestHeaders({
      "accept-language": "uk,en;q=0.8",
    });

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toEqual({ path: "/uk", redirectCode: 302 });
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("uk");
  });

  it("does not use Accept-Language for non-root paths in as-needed mode", async () => {
    setServerMode(true);
    withDetect({ useCookie: false });
    setMockRequestHeaders({
      "accept-language": "uk,en;q=0.8",
    });

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("redirects to detected locale when redirectOnFirstVisit is true and cookie has locale", async () => {
    withDetect({ useCookie: true, redirectOnFirstVisit: true });
    setMockCookie("i18n_locale", "uk");

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toEqual({ path: "/uk", redirectCode: 302 });
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("uk");
  });

  it("falls back to default locale when fallbackLocale is unsupported", async () => {
    withDetect({ useCookie: false, fallbackLocale: "es" });

    await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("uses the first supported fallback locale when fallbackLocale is an array", async () => {
    withDetect({ useCookie: false, fallbackLocale: ["es", "de"] });

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toEqual({ path: "/de", redirectCode: 302 });
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("redirects root to locale prefix in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toEqual({ path: "/en", redirectCode: 302 });
  });

  it("preserves locale-prefixed path in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await runMiddleware({
      path: "/de/about",
      fullPath: "/de/about",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("skips exact /api path (not just /api/*)", async () => {
    const result = await runMiddleware({
      path: "/api",
      fullPath: "/api",
    });

    expect(result).toBeUndefined();
  });

  it("handles detectBrowserLanguage set to false", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
    setMockCookie("i18n_locale", "uk");

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("does not update i18n when locale already matches", async () => {
    const setLocale = vi.fn(async () => {});
    setMockI18n({
      locale: { value: "en" },
      setLocale,
    });

    await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("redirects non-default locale to prefixed path in as-needed mode for root", async () => {
    setMockCookie("i18n_locale", "uk");

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toEqual({ path: "/uk", redirectCode: 302 });
  });

  it("does not redirect in never mode when path has no prefix", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await runMiddleware({
      path: "/about",
      fullPath: "/about",
    });

    expect(result).toBeUndefined();
  });

  it("removes locale prefix from root path in never mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await runMiddleware({
      path: "/de",
      fullPath: "/de",
    });

    expect(result).toEqual({ path: "/", redirectCode: 302 });
  });

  it("handles setLocale failure gracefully without breaking navigation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setLocale = vi.fn(async () => {
      throw new Error("Network error");
    });
    setMockI18n({
      locale: { value: "en" },
      setLocale,
    });
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/",
      fullPath: "/",
    });

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to switch language"),
      "Network error",
    );

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("en");
  });

  it("redirects away from locale-prefixed URLs when that locale failed to render", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setLocale = vi.fn(async () => {
      throw new Error("Network error");
    });
    setMockI18n({
      locale: { value: "en" },
      setLocale,
    });

    const result = await runMiddleware({
      path: "/de/about",
      fullPath: "/de/about?x=1#top",
    });

    expect(result).toEqual({ path: "/about?x=1#top", redirectCode: 302 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to switch language"),
      "Network error",
    );
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("en");
  });

  it("handles trailing slashes in paths", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/about/",
      fullPath: "/about/",
    });

    expect(result).toEqual({ path: "/de/about/", redirectCode: 302 });
  });

  it("switching to default locale from non-default path strips the prefix without bouncing back via cookie", async () => {
    const mockLocale = { value: "de" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({ locale: mockLocale, setLocale });
    setMockCookie("i18n_locale", "de");

    const result = await runMiddleware({
      path: "/plurals",
      fullPath: "/plurals",
    });

    expect(result).toBeUndefined();
    expect(setLocale).toHaveBeenCalledWith("en");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("passive navigation to a path-implied default URL preserves the cookied preference", async () => {
    const mockLocale = { value: "de" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({ locale: mockLocale, setLocale });
    setMockCookie("i18n_locale", "de");

    await runMiddleware({
      path: "/plurals",
      fullPath: "/plurals",
    });

    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("de");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("does not restore cookie when the user already opted into the default locale before navigation", async () => {
    const mockLocale = { value: "en" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({ locale: mockLocale, setLocale });
    setMockCookie("i18n_locale", "en");

    await runMiddleware({
      path: "/plurals",
      fullPath: "/plurals",
    });

    expect(setLocale).not.toHaveBeenCalled();
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("en");
  });

  it("does not preserve cookie when path carries an explicit locale prefix", async () => {
    const mockLocale = { value: "en" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({ locale: mockLocale, setLocale });
    setMockCookie("i18n_locale", "de");

    await runMiddleware({
      path: "/uk/about",
      fullPath: "/uk/about",
    });

    expect(setLocale).toHaveBeenCalledWith("uk");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("uk");
  });

  describe("locale cookie attributes", () => {
    it("writes the cookie with the attributes the detection config asks for", async () => {
      withDetect({
        cookieMaxAge: 600,
        sameSite: "strict",
        domain: ".example.com",
        cookieSecure: false,
      });

      await runMiddleware({ path: "/", fullPath: "/" });

      expect(getMockCookieOptions("i18n_locale")).toEqual({
        maxAge: 600,
        path: "/",
        sameSite: "strict",
        domain: ".example.com",
        secure: false,
      });
    });

    it("writes a year-long secure lax cookie when detection configures no attributes", async () => {
      mockRuntimeConfig.public.comvi.detectBrowserLanguage = { useCookie: true } as DetectConfig;

      await runMiddleware({ path: "/", fullPath: "/" });

      expect(getMockCookieOptions("i18n_locale")).toEqual({
        maxAge: 31536000,
        path: "/",
        sameSite: "lax",
        domain: undefined,
        secure: true,
      });
    });

    it("drops the secure flag in a dev build so localhost HTTP keeps the cookie", async () => {
      vi.stubGlobal("__COMVI_TEST_DEV__", true);
      withDetect({ cookieSecure: true });

      await runMiddleware({ path: "/", fullPath: "/" });

      expect(getMockCookieOptions("i18n_locale")).toMatchObject({ secure: false });
    });

    it("creates no cookie at all when browser detection is disabled", async () => {
      mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
      setMockCookie("i18n_locale", "uk");

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toBeUndefined();
      expect(getMockCookieOptions("i18n_locale")).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("en");
    });

    it("ignores a stored preference at the root path when useCookie is disabled", async () => {
      withDetect({ useCookie: false });
      setMockCookie("i18n_locale", "uk");

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("en");
    });
  });

  describe("routes the middleware never rewrites", () => {
    it.each(["/_nuxt/app.js", "/api", "/api/health"])(
      "leaves %s untouched even in always mode",
      async (path) => {
        mockRuntimeConfig.public.comvi.localePrefix = "always";

        const result = await runMiddleware({ path, fullPath: path });

        expect(result).toBeUndefined();
      },
    );
  });

  describe("Accept-Language detection", () => {
    it("keeps an explicit path locale over the Accept-Language header", async () => {
      setServerMode(true);
      setMockRequestHeaders({ "accept-language": "uk" });

      const result = await runMiddleware({ path: "/de/about", fullPath: "/de/about" });

      expect(result).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("de");
    });

    it("skips header detection entirely when browser detection is disabled", async () => {
      setServerMode(true);
      mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
      setMockRequestHeaders({ "accept-language": "uk" });

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("en");
    });

    it("resolves the fallback locale when the request sends no Accept-Language header", async () => {
      setServerMode(true);
      withDetect({ useCookie: false });

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("en");
    });

    it("redirects to the fallback locale when the header matched nothing and first-visit redirects are off", async () => {
      setServerMode(true);
      withDetect({ useCookie: false, redirectOnFirstVisit: false, fallbackLocale: "de" });
      setMockRequestHeaders({ "accept-language": "ja" });

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toEqual({ path: "/de", redirectCode: 302 });
      expect(useState<string>("i18n-locale").value).toBe("de");
    });

    it("still redirects a cookie-detected locale when first-visit redirects are off", async () => {
      withDetect({ useCookie: true, redirectOnFirstVisit: false });
      setMockCookie("i18n_locale", "uk");

      const result = await runMiddleware({ path: "/", fullPath: "/" });

      expect(result).toEqual({ path: "/uk", redirectCode: 302 });
    });
  });

  it("does not rewrite the cookie that already holds the rendered locale", async () => {
    setMockCookie("i18n_locale", "de");

    await runMiddleware({ path: "/de/about", fullPath: "/de/about" });

    // Only the value the test itself seeded: the middleware added no Set-Cookie.
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it("does not rewrite the cookie when the preserved preference is still intact", async () => {
    const setLocale = vi.fn(async () => {});
    setMockI18n({ locale: { value: "de" }, setLocale });
    setMockCookie("i18n_locale", "de");

    await runMiddleware({ path: "/plurals", fullPath: "/plurals" });

    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it("stores the locale that actually rendered when switching to the path-implied default fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setLocale = vi.fn(async () => {
      throw new Error("Network error");
    });
    setMockI18n({ locale: { value: "de" }, setLocale });
    setMockCookie("i18n_locale", "en");

    const result = await runMiddleware({ path: "/plurals", fullPath: "/plurals" });

    expect(result).toEqual({ path: "/de/plurals", redirectCode: 302 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to switch language"),
      "Network error",
    );
    expect(useCookie("i18n_locale").value).toBe("de");
  });

  describe("query parameter detection", () => {
    // Deliberately not via `withDetect`: these tests never read `fallbackLocale`.
    const withQueryParam = (overrides: Record<string, unknown> = {}) => {
      mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
        ...DETECT_SKELETON,
        useCookie: false,
        queryParam: "lang",
        ...overrides,
      } as DetectConfig;
    };

    it("uses the query locale in never mode without redirecting (forest-page shape)", async () => {
      setServerMode(true);
      mockRuntimeConfig.public.comvi.localePrefix = "never";
      withQueryParam();
      setMockRequestHeaders({ "accept-language": "uk,en;q=0.8" });

      const result = await runMiddleware({
        path: "/my-forest",
        fullPath: "/my-forest?lang=de",
        query: { lang: "de" },
      });

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("prefers the query locale over the cookie", async () => {
      withQueryParam({ useCookie: true });
      setMockCookie("i18n_locale", "de");

      const result = await runMiddleware({
        path: "/",
        fullPath: "/?lang=uk",
        query: { lang: "uk" },
      });

      expect(result).toEqual({ path: "/uk?lang=uk", redirectCode: 302 });
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("uk");
    });

    it("keeps an explicit path prefix over the query locale", async () => {
      withQueryParam();

      const result = await runMiddleware({
        path: "/de/about",
        fullPath: "/de/about?lang=uk",
        query: { lang: "uk" },
      });

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("keeps an explicit default path locale authoritative after canonicalization", async () => {
      withQueryParam();

      const firstResult = await runMiddleware({
        path: "/en/about",
        fullPath: "/en/about?lang=de&sort=asc#details",
        query: { lang: "de", sort: "asc" },
      });

      expect(firstResult).toEqual({ path: "/about?lang=en&sort=asc#details", redirectCode: 302 });

      const secondResult = await runMiddleware({
        path: "/about",
        fullPath: "/about?lang=en&sort=asc#details",
        query: { lang: "en", sort: "asc" },
      });

      expect(secondResult).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("en");
    });

    it("keeps an explicit path locale authoritative when never mode removes its prefix", async () => {
      mockRuntimeConfig.public.comvi.localePrefix = "never";
      withQueryParam();

      const firstResult = await runMiddleware({
        path: "/de/about",
        fullPath: "/de/about?lang=uk&sort=asc#details",
        query: { lang: "uk", sort: "asc" },
      });

      expect(firstResult).toEqual({ path: "/about?lang=de&sort=asc#details", redirectCode: 302 });

      const secondResult = await runMiddleware({
        path: "/about",
        fullPath: "/about?lang=de&sort=asc#details",
        query: { lang: "de", sort: "asc" },
      });

      expect(secondResult).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("beats the implied default of a prefixless path in as-needed mode", async () => {
      withQueryParam();

      const result = await runMiddleware({
        path: "/about",
        fullPath: "/about?lang=de",
        query: { lang: "de" },
      });

      expect(result).toEqual({ path: "/de/about?lang=de", redirectCode: 302 });
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("ignores query values outside the locale allowlist", async () => {
      withQueryParam({ useCookie: true });
      setMockCookie("i18n_locale", "de");

      const result = await runMiddleware({
        path: "/",
        fullPath: "/?lang=xx",
        query: { lang: "xx" },
      });

      expect(result).toEqual({ path: "/de?lang=xx", redirectCode: 302 });
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("tolerates a route that carries no query object at all", async () => {
      withQueryParam();

      const result = await runMiddleware({ path: "/about", fullPath: "/about" });

      expect(result).toBeUndefined();
      expect(useState<string>("i18n-locale").value).toBe("en");
    });

    it("leaves the redirect suffix untouched when the URL carries no locale query parameter", async () => {
      withQueryParam();

      const result = await runMiddleware({
        path: "/en/about",
        fullPath: "/en/about?sort=asc",
        query: { sort: "asc" },
      });

      expect(result).toEqual({ path: "/about?sort=asc", redirectCode: 302 });
    });

    it("updates the cookie to the query-selected locale instead of preserving the stored one", async () => {
      withQueryParam({ useCookie: true });
      setMockCookie("i18n_locale", "uk");

      const result = await runMiddleware({
        path: "/about",
        fullPath: "/about?lang=de",
        query: { lang: "de" },
      });

      expect(result).toEqual({ path: "/de/about?lang=de", redirectCode: 302 });
      expect(useCookie("i18n_locale").value).toBe("de");
    });

    it("ignores the query parameter when not configured", async () => {
      mockRuntimeConfig.public.comvi.localePrefix = "never";

      const result = await runMiddleware({
        path: "/my-forest",
        fullPath: "/my-forest?lang=de",
        query: { lang: "de" },
      });

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("en");
    });
  });
});
