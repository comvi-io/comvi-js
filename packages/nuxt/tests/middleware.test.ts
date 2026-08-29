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
} from "./mocks/nuxt-app";
import { useCookie, useState } from "#app";
import { isServer } from "../src/runtime/utils/runtime";

const setServerMode = (value: boolean) => {
  (isServer as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);
};

describe("i18n middleware", () => {
  beforeEach(() => {
    resetMocks();
    setServerMode(false);
  });

  it("respects cookie locale on root path and preserves query/hash", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/",
      fullPath: "/?x=1#top",
    } as any);

    expect(result?.path).toBe("/de?x=1#top");

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("treats non-root path with no prefix as default locale in as-needed mode, ignoring cookie", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/about",
      fullPath: "/about?x=1#top",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("removes default locale prefix in as-needed mode", async () => {
    const result = await middleware({
      path: "/en/about",
      fullPath: "/en/about",
    } as any);

    expect(result?.path).toBe("/about");
  });

  it("adds locale prefix in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await middleware({
      path: "/about",
      fullPath: "/about?x=1",
    } as any);

    expect(result?.path).toBe("/en/about?x=1");
  });

  it("removes locale prefix in never mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await middleware({
      path: "/de/about",
      fullPath: "/de/about",
    } as any);

    expect(result?.path).toBe("/about");
  });

  it("ignores cookies when useCookie is false", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: "en",
    };
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

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

    await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(setLocale).toHaveBeenCalledWith("de");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("skips internal app and api paths", async () => {
    const apiResult = await middleware({
      path: "/api/health",
      fullPath: "/api/health",
    } as any);
    const nuxtResult = await middleware({
      path: "/_nuxt/app.js",
      fullPath: "/_nuxt/app.js",
    } as any);

    expect(apiResult).toBeUndefined();
    expect(nuxtResult).toBeUndefined();
  });

  it("does not skip routes that only start with /api prefix", async () => {
    const result = await middleware({
      path: "/de/apix",
      fullPath: "/de/apix",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not skip dotted app routes", async () => {
    const result = await middleware({
      path: "/de/john.doe",
      fullPath: "/de/john.doe",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not redirect when redirectOnFirstVisit is false and locale detected from header", async () => {
    setServerMode(true);
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: false,
      fallbackLocale: "en",
    };
    setMockRequestHeaders({
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    });

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("redirects root to detected Accept-Language locale in as-needed mode", async () => {
    setServerMode(true);
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: "en",
    };
    setMockRequestHeaders({
      "accept-language": "uk,en;q=0.8",
    });

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result?.path).toBe("/uk");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("uk");
  });

  it("does not use Accept-Language for non-root paths in as-needed mode", async () => {
    setServerMode(true);
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: "en",
    };
    setMockRequestHeaders({
      "accept-language": "uk,en;q=0.8",
    });

    const result = await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("redirects to detected locale when redirectOnFirstVisit is true and cookie has locale", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: true,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: "en",
    };
    setMockCookie("i18n_locale", "uk");

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result?.path).toBe("/uk");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("uk");
  });

  it("falls back to default locale when fallbackLocale is unsupported", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: "es",
    };

    await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
  });

  it("uses the first supported fallback locale when fallbackLocale is an array", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
      cookieName: "i18n_locale",
      cookieMaxAge: 31536000,
      redirectOnFirstVisit: true,
      fallbackLocale: ["es", "de"],
    };

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result?.path).toBe("/de");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("redirects root to locale prefix in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result?.path).toBe("/en");
  });

  it("preserves locale-prefixed path in always mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";

    const result = await middleware({
      path: "/de/about",
      fullPath: "/de/about",
    } as any);

    expect(result).toBeUndefined();
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("skips exact /api path (not just /api/*)", async () => {
    const result = await middleware({
      path: "/api",
      fullPath: "/api",
    } as any);

    expect(result).toBeUndefined();
  });

  it("handles detectBrowserLanguage set to false", async () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
    setMockCookie("i18n_locale", "uk");

    const result = await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

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

    await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

    // Locale is already "en", so setLocale should not be called
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("redirects non-default locale to prefixed path in as-needed mode for root", async () => {
    setMockCookie("i18n_locale", "uk");

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result?.path).toBe("/uk");
  });

  it("does not redirect in never mode when path has no prefix", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);

    expect(result).toBeUndefined();
  });

  it("removes locale prefix from root path in never mode", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";

    const result = await middleware({
      path: "/de",
      fullPath: "/de",
    } as any);

    expect(result?.path).toBe("/");
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

    const result = await middleware({
      path: "/",
      fullPath: "/",
    } as any);

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to switch language"),
      "Network error",
    );

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("en");

    warnSpy.mockRestore();
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

    const result = await middleware({
      path: "/de/about",
      fullPath: "/de/about?x=1#top",
    } as any);

    expect(result?.path).toBe("/about?x=1#top");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("en");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("en");

    warnSpy.mockRestore();
  });

  it("handles trailing slashes in paths", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/about/",
      fullPath: "/about/",
    } as any);

    expect(result?.path).toBe("/de/about/");
  });

  it("switching to default locale from non-default path strips the prefix without bouncing back via cookie", async () => {
    const mockLocale = { value: "de" };
    const setLocale = vi.fn(async (lang: string) => {
      mockLocale.value = lang;
    });
    setMockI18n({ locale: mockLocale, setLocale });
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/plurals",
      fullPath: "/plurals",
    } as any);

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

    await middleware({
      path: "/plurals",
      fullPath: "/plurals",
    } as any);

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

    await middleware({
      path: "/plurals",
      fullPath: "/plurals",
    } as any);

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

    await middleware({
      path: "/uk/about",
      fullPath: "/uk/about",
    } as any);

    expect(setLocale).toHaveBeenCalledWith("uk");
    const localeCookie = useCookie("i18n_locale");
    expect(localeCookie.value).toBe("uk");
  });

  describe("query parameter detection", () => {
    const withQueryParam = (overrides: Record<string, unknown> = {}) => {
      mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
        useCookie: false,
        cookieName: "i18n_locale",
        cookieMaxAge: 31536000,
        redirectOnFirstVisit: true,
        queryParam: "lang",
        ...overrides,
      };
    };

    it("uses the query locale in never mode without redirecting (forest-page shape)", async () => {
      setServerMode(true);
      mockRuntimeConfig.public.comvi.localePrefix = "never";
      withQueryParam();
      setMockRequestHeaders({ "accept-language": "uk,en;q=0.8" });

      const result = await middleware({
        path: "/my-forest",
        fullPath: "/my-forest?lang=de",
        query: { lang: "de" },
      } as any);

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("prefers the query locale over the cookie", async () => {
      withQueryParam({ useCookie: true });
      setMockCookie("i18n_locale", "de");

      const result = await middleware({
        path: "/",
        fullPath: "/?lang=uk",
        query: { lang: "uk" },
      } as any);

      expect(result?.path).toBe("/uk?lang=uk");
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("uk");
    });

    it("keeps an explicit path prefix over the query locale", async () => {
      withQueryParam();

      const result = await middleware({
        path: "/de/about",
        fullPath: "/de/about?lang=uk",
        query: { lang: "uk" },
      } as any);

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("keeps an explicit default path locale authoritative after canonicalization", async () => {
      withQueryParam();

      const firstResult = await middleware({
        path: "/en/about",
        fullPath: "/en/about?lang=de&sort=asc#details",
        query: { lang: "de", sort: "asc" },
      } as any);

      expect(firstResult?.path).toBe("/about?lang=en&sort=asc#details");

      const secondResult = await middleware({
        path: "/about",
        fullPath: "/about?lang=en&sort=asc#details",
        query: { lang: "en", sort: "asc" },
      } as any);

      expect(secondResult).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("en");
    });

    it("keeps an explicit path locale authoritative when never mode removes its prefix", async () => {
      mockRuntimeConfig.public.comvi.localePrefix = "never";
      withQueryParam();

      const firstResult = await middleware({
        path: "/de/about",
        fullPath: "/de/about?lang=uk&sort=asc#details",
        query: { lang: "uk", sort: "asc" },
      } as any);

      expect(firstResult?.path).toBe("/about?lang=de&sort=asc#details");

      const secondResult = await middleware({
        path: "/about",
        fullPath: "/about?lang=de&sort=asc#details",
        query: { lang: "de", sort: "asc" },
      } as any);

      expect(secondResult).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("beats the implied default of a prefixless path in as-needed mode", async () => {
      withQueryParam();

      const result = await middleware({
        path: "/about",
        fullPath: "/about?lang=de",
        query: { lang: "de" },
      } as any);

      expect(result?.path).toBe("/de/about?lang=de");
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("ignores query values outside the locale allowlist", async () => {
      withQueryParam({ useCookie: true });
      setMockCookie("i18n_locale", "de");

      const result = await middleware({
        path: "/",
        fullPath: "/?lang=xx",
        query: { lang: "xx" },
      } as any);

      expect(result?.path).toBe("/de?lang=xx");
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("de");
    });

    it("ignores the query parameter when not configured", async () => {
      mockRuntimeConfig.public.comvi.localePrefix = "never";

      const result = await middleware({
        path: "/my-forest",
        fullPath: "/my-forest?lang=de",
        query: { lang: "de" },
      } as any);

      expect(result).toBeUndefined();
      const localeState = useState<string>("i18n-locale");
      expect(localeState.value).toBe("en");
    });
  });
});
