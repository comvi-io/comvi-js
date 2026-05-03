import { describe, it, expect, beforeEach } from "vitest";
import {
  resetMocks,
  setMockRoute,
  mockRuntimeConfig,
  setRouterResolveOverride,
} from "./mocks/nuxt-app";
import { useLocalePath } from "../src/runtime/composables/useLocalePath";
import { useSwitchLocalePath } from "../src/runtime/composables/useSwitchLocalePath";
import { useLocaleRoute } from "../src/runtime/composables/useLocaleRoute";
import { useLocaleHead } from "../src/runtime/composables/useLocaleHead";
import { useRouteConfig } from "../src/runtime/composables/useRouteConfig";
import { useState } from "#app";

describe("useLocalePath", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("preserves query/hash and replaces existing prefix", () => {
    const localePath = useLocalePath();

    expect(localePath("/de/about?x=1#top", "uk")).toBe("/uk/about?x=1#top");
  });

  it("handles route objects via router.resolve", () => {
    const localePath = useLocalePath();

    const result = localePath({ name: "about", query: { q: "1" }, hash: "#top" }, "de");
    expect(result).toBe("/de/about?q=1#top");
  });

  it("keeps named route without locale suffix for default locale in as-needed mode", () => {
    const localePath = useLocalePath();

    const result = localePath({ name: "about___de" }, "en");
    expect(result).toBe("/about");
  });

  it("handles route objects with array query values", () => {
    const localePath = useLocalePath();

    const result = localePath({ name: "search", query: { tag: ["a", "b"] } }, "de");
    expect(result).toBe("/de/search?tag=a&tag=b");
  });

  it("handles route objects with undefined query values (filters them out)", () => {
    const localePath = useLocalePath();

    const result = localePath({ name: "search", query: { keep: "yes", drop: undefined } }, "de");
    expect(result).toBe("/de/search?keep=yes");
  });

  it("handles route object with path property", () => {
    const localePath = useLocalePath();

    const result = localePath({ path: "/contact" }, "de");
    expect(result).toBe("/de/contact");
  });

  it("handles string paths without leading slash", () => {
    const localePath = useLocalePath();

    const result = localePath("about", "de");
    expect(result).toBe("/de/about");
  });

  it("returns root path for default locale in as-needed mode", () => {
    const localePath = useLocalePath();

    expect(localePath("/")).toBe("/");
  });

  it("prefixes all locales in always mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    const localePath = useLocalePath();

    expect(localePath("/about", "en")).toBe("/en/about");
    expect(localePath("/about", "de")).toBe("/de/about");
  });

  it("never prefixes in never mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    const localePath = useLocalePath();

    expect(localePath("/about", "de")).toBe("/about");
  });

  it("falls back to path property when router.resolve throws", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath({ path: "/settings" }, "de");
    expect(result).toBe("/de/settings");
  });

  it("falls back to named route with query/hash when router.resolve throws", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath(
      { name: "dashboard", query: { tab: "stats", ids: [1, 2] }, hash: "#section" },
      "de",
    );
    expect(result).toBe("/de/dashboard?tab=stats&ids=1&ids=2#section");
  });

  it("handles empty query in named route fallback", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath({ name: "home" }, "de");
    expect(result).toBe("/de/home");
  });

  it("filters null/undefined from array query values in fallback", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath(
      { name: "search", query: { tag: ["a", null, undefined, "b"] } },
      "de",
    );
    expect(result).toBe("/de/search?tag=a&tag=b");
  });
});

describe("useLocalePath - trailing slashes", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("preserves trailing slash on non-root paths", () => {
    const localePath = useLocalePath();

    expect(localePath("/about/", "de")).toBe("/de/about/");
  });

  it("preserves trailing slash for default locale in as-needed mode", () => {
    const localePath = useLocalePath();

    expect(localePath("/about/", "en")).toBe("/about/");
  });

  it("preserves trailing slash in always mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    const localePath = useLocalePath();

    expect(localePath("/about/", "en")).toBe("/en/about/");
  });

  it("does not add trailing slash to root locale path", () => {
    const localePath = useLocalePath();

    // Root path / for non-default locale should be /de (not /de/)
    expect(localePath("/", "de")).toBe("/de");
  });
});

describe("useSwitchLocalePath", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("keeps query/hash when switching locales", () => {
    setMockRoute({
      path: "/de/products",
      fullPath: "/de/products?sort=asc#list",
    });

    const switchLocalePath = useSwitchLocalePath();
    expect(switchLocalePath("uk")).toBe("/uk/products?sort=asc#list");
  });

  it("falls back to default locale for invalid input", () => {
    setMockRoute({ path: "/about", fullPath: "/about" });

    const switchLocalePath = useSwitchLocalePath();
    // "es" is not in configured locales, so it falls back to defaultLocale "en".
    // In as-needed mode, the default locale "en" produces no prefix: "/about"
    const defaultLocalePath = switchLocalePath("en");
    expect(switchLocalePath("es")).toBe(defaultLocalePath);
  });
});

describe("useLocaleRoute", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns a resolved route with localized path", () => {
    const localeRoute = useLocaleRoute();

    const resolved = localeRoute("/about", "de");
    expect(resolved!.fullPath).toBe("/de/about");
  });
});

describe("useLocaleHead", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("builds canonical and alternate links for current locale", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");

    const headConfig = useLocaleHead({ baseUrl: "https://example.com" });
    const head = headConfig.value as Record<string, unknown>;
    const links = head.link as Array<Record<string, string>>;

    const canonical = links.find((link) => link.rel === "canonical");
    expect(canonical?.href).toBe("https://example.com/de/about");

    const alternates = links.filter((link) => link.rel === "alternate");
    expect(alternates).toHaveLength(mockRuntimeConfig.public.comvi.locales.length + 1);

    // Verify each locale's alternate link has the correct hreflang and href
    const enAlternate = alternates.find((link) => link.hreflang === "en");
    expect(enAlternate?.href).toBe("https://example.com/about");

    const deAlternate = alternates.find((link) => link.hreflang === "de");
    expect(deAlternate?.href).toBe("https://example.com/de/about");

    const ukAlternate = alternates.find((link) => link.hreflang === "uk");
    expect(ukAlternate?.href).toBe("https://example.com/uk/about");

    const xDefault = alternates.find((link) => link.hreflang === "x-default");
    expect(xDefault?.href).toBe("https://example.com/about");
  });

  it("supports iso/dir html attrs and trimming baseUrl slash", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    mockRuntimeConfig.public.comvi.localeObjects.de = {
      code: "de",
      name: "Deutsch",
      iso: "de-DE",
      dir: "rtl",
    };

    const headConfig = useLocaleHead({
      baseUrl: "https://example.com/",
      addCanonical: false,
      addAlternateLinks: false,
    });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.htmlAttrs).toEqual({
      lang: "de-DE",
      dir: "rtl",
    });
    expect(head.link).toBeUndefined();
  });

  it("can disable og/canonical/alternate output", () => {
    setMockRoute({ path: "/about", fullPath: "/about" });
    useState<string>("i18n-locale", () => "en");

    const headConfig = useLocaleHead({
      baseUrl: "https://example.com",
      addOgLocale: false,
      addCanonical: false,
      addAlternateLinks: false,
    });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.meta).toBeUndefined();
    expect(head.link).toBeUndefined();
  });
});

describe("useRouteConfig", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("builds localized paths for as-needed mode", () => {
    const routeConfig = useRouteConfig();

    expect(routeConfig.getPathname({ locale: "en", href: "about" })).toBe("/about");
    expect(routeConfig.getPathname({ locale: "de", href: "/about" })).toBe("/de/about");
    expect(routeConfig.getAllLocalizedPaths("/about")).toEqual([
      { locale: "en", path: "/about" },
      { locale: "de", path: "/de/about" },
      { locale: "uk", path: "/uk/about" },
    ]);
  });

  it("prefixes all locales in always mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    const routeConfig = useRouteConfig();

    expect(routeConfig.getPathname({ locale: "en", href: "/about" })).toBe("/en/about");
    expect(routeConfig.getPathname({ locale: "de", href: "/" })).toBe("/de");
  });

  it("does not prefix locale in never mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    const routeConfig = useRouteConfig();

    expect(routeConfig.getPathname({ locale: "de", href: "/about" })).toBe("/about");
  });
});
