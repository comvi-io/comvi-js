import { describe, it, expect, beforeEach, vi } from "vitest";
import middleware from "../src/runtime/middleware/i18n.global";
import {
  resetMocks,
  setMockCookie,
  setMockRequestHeaders,
  setMockI18n,
  mockRuntimeConfig,
} from "./mocks/nuxt-app";
import { useCookie, useState } from "#app";

describe("i18n middleware", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("respects cookie locale and preserves query/hash", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/about",
      fullPath: "/about?x=1#top",
    } as any);

    expect(result?.path).toBe("/de/about?x=1#top");

    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
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
      path: "/about",
      fullPath: "/about",
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
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/apix",
      fullPath: "/apix",
    } as any);

    expect(result?.path).toBe("/de/apix");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not skip dotted app routes", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/john.doe",
      fullPath: "/john.doe",
    } as any);

    expect(result?.path).toBe("/de/john.doe");
    const localeState = useState<string>("i18n-locale");
    expect(localeState.value).toBe("de");
  });

  it("does not redirect when redirectOnFirstVisit is false and locale detected from header", async () => {
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
      path: "/about",
      fullPath: "/about",
    } as any);

    // No redirect because redirectOnFirstVisit is false and Accept-Language
    // detection runs only on server (import.meta.server is false in tests),
    // so the locale falls back to "en" (default) which needs no prefix redirect
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
      path: "/about",
      fullPath: "/about",
    } as any);

    // Cookie detected "uk" which is non-default, so redirect to add prefix
    expect(result?.path).toBe("/uk/about");
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

    // Path already has locale prefix, no redirect needed
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
      path: "/about",
      fullPath: "/about",
    } as any);

    // The route should stay on the language that actually rendered.
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to switch language"),
      "Network error",
    );

    // State should reflect the actual i18n language (the one that rendered)
    // to prevent SSR/hydration mismatches when setLanguage failed
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
    setMockCookie("i18n_locale", "de");

    const result = await middleware({
      path: "/about/",
      fullPath: "/about/",
    } as any);

    expect(result?.path).toBe("/de/about/");
  });
});
