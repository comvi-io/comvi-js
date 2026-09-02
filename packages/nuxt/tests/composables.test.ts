import { describe, it, expect, beforeEach, vi } from "vitest";
import * as nuxtAppMocks from "./mocks/nuxt-app";
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

  it("normalizes a slashless path before stripping its locale prefix", () => {
    const localePath = useLocalePath();

    expect(localePath("de/about", "uk")).toBe("/uk/about");
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

  it("falls back to the route name when the route object carries no usable path", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath({ name: "dashboard", path: undefined }, "de");

    expect(result).toBe("/de/dashboard");
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

describe("useLocalePath - named routes", () => {
  beforeEach(() => {
    resetMocks();
  });

  /** Records what reaches the router so the generated route name is observable. */
  const captureResolve = () => {
    const seen: unknown[] = [];
    setRouterResolveOverride((to) => {
      seen.push(to);
      return { fullPath: "/resolved", path: "/resolved", href: "/resolved" };
    });
    return seen;
  };

  it.each([
    { mode: "as-needed" as const, locale: "de", expectedName: "about___de" },
    { mode: "as-needed" as const, locale: "en", expectedName: "about" },
    { mode: "always" as const, locale: "en", expectedName: "about___en" },
    { mode: "never" as const, locale: "de", expectedName: "about" },
  ])(
    "resolves the named route as $expectedName for $locale in $mode mode",
    ({ mode, locale, expectedName }) => {
      mockRuntimeConfig.public.comvi.localePrefix = mode;
      const seen = captureResolve();
      const localePath = useLocalePath();

      localePath({ name: "about" }, locale);

      expect(seen).toEqual([{ name: expectedName }]);
    },
  );

  it("replaces a manually supplied locale suffix with the target locale", () => {
    const seen = captureResolve();
    const localePath = useLocalePath();

    localePath({ name: "about___uk" }, "de");

    expect(seen).toEqual([{ name: "about___de" }]);
  });

  it("leaves a route object whose name is undefined to the router untouched", () => {
    const seen = captureResolve();
    const localePath = useLocalePath();

    localePath({ path: "/about", name: undefined }, "de");

    expect(seen).toEqual([{ path: "/about", name: undefined }]);
  });

  it("uses string paths verbatim instead of resolving them through the router", () => {
    const seen = captureResolve();
    const localePath = useLocalePath();

    expect(localePath("/about", "de")).toBe("/de/about");
    expect(seen).toEqual([]);
  });

  it("drops null and undefined scalar query values in the named-route fallback", () => {
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });
    const localePath = useLocalePath();

    const result = localePath(
      { name: "search", query: { keep: "yes", drop: undefined, gone: null } },
      "de",
    );

    expect(result).toBe("/de/search?keep=yes");
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

    expect(localePath("/", "de")).toBe("/de");
  });
});

describe("useSwitchLocalePath", () => {
  beforeEach(() => {
    resetMocks();
  });

  const enableQueryParamDetection = () => {
    mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      ...mockRuntimeConfig.public.comvi.detectBrowserLanguage,
      queryParam: "lang",
    };
  };

  it("keeps query/hash when switching locales", () => {
    setMockRoute({
      path: "/de/products",
      fullPath: "/de/products?sort=asc#list",
    });

    const switchLocalePath = useSwitchLocalePath();
    expect(switchLocalePath("uk")).toBe("/uk/products?sort=asc#list");
  });

  it("falls back to default locale for invalid input, silently outside dev builds", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setMockRoute({ path: "/about", fullPath: "/about" });

    const switchLocalePath = useSwitchLocalePath();

    // "es" is unsupported, so it falls back to "en", which is unprefixed in as-needed mode.
    expect(switchLocalePath("es")).toBe("/about");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns in a dev build when switchLocalePath is called with an unknown locale", () => {
    vi.stubGlobal("__COMVI_TEST_DEV__", true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setMockRoute({ path: "/about", fullPath: "/about" });

    const switchLocalePath = useSwitchLocalePath();

    expect(switchLocalePath("es")).toBe("/about");
    expect(warnSpy).toHaveBeenCalledWith(
      '[@comvi/nuxt] switchLocalePath called with invalid locale "es". ' +
        "Available locales: en, de, uk",
    );
  });

  it.each([
    {
      mode: "never" as const,
      currentPath: "/my-forest?lang=de&sort=asc#list",
      targetLocale: "uk",
      expectedPath: "/my-forest?lang=uk&sort=asc#list",
    },
    {
      mode: "as-needed" as const,
      currentPath: "/de/products?lang=de&sort=asc#list",
      targetLocale: "en",
      expectedPath: "/products?lang=en&sort=asc#list",
    },
    {
      mode: "always" as const,
      currentPath: "/de/products?lang=de&sort=asc#list",
      targetLocale: "uk",
      expectedPath: "/uk/products?lang=uk&sort=asc#list",
    },
  ])(
    "synchronizes the configured locale query when switching in $mode mode",
    ({ mode, currentPath, targetLocale, expectedPath }) => {
      enableQueryParamDetection();
      mockRuntimeConfig.public.comvi.localePrefix = mode;
      setMockRoute({ path: currentPath.split(/[?#]/)[0], fullPath: currentPath });

      const switchLocalePath = useSwitchLocalePath();

      expect(switchLocalePath(targetLocale)).toBe(expectedPath);
    },
  );

  it("adds the configured locale query when the current URL does not contain it", () => {
    enableQueryParamDetection();
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    setMockRoute({
      path: "/my-forest",
      fullPath: "/my-forest?sort=asc#list",
    });

    const switchLocalePath = useSwitchLocalePath();

    expect(switchLocalePath("uk")).toBe("/my-forest?sort=asc&lang=uk#list");
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

  it("resolves route objects through the localized path", () => {
    const localeRoute = useLocaleRoute();

    const resolved = localeRoute({ name: "about", query: { q: "1" } }, "de");

    expect(resolved!.fullPath).toBe("/de/about?q=1");
  });

  it("leaves the path unprefixed in never mode", () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    const localeRoute = useLocaleRoute();

    const resolved = localeRoute("/about", "de");

    expect(resolved!.fullPath).toBe("/about");
  });

  it("returns undefined when the router cannot resolve the localized path", () => {
    const localeRoute = useLocaleRoute();
    setRouterResolveOverride(() => {
      throw new Error("No route found");
    });

    const resolved = localeRoute("/about", "de");

    expect(resolved).toBeUndefined();
  });
});

describe("useLocaleHead", () => {
  beforeEach(() => {
    resetMocks();
  });

  /** German carries an iso, Ukrainian an iso only, French no locale object at all. */
  const withMixedLocaleObjects = () => {
    mockRuntimeConfig.public.comvi.locales = ["en", "de", "uk", "fr"];
    mockRuntimeConfig.public.comvi.localeObjects.de = {
      code: "de",
      name: "Deutsch",
      iso: "de-DE",
    };
    mockRuntimeConfig.public.comvi.localeObjects.uk = {
      code: "uk",
      name: "Українська",
      iso: "uk-UA",
    };
  };

  it("emits OpenGraph locale meta for the current locale and every alternate", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    withMixedLocaleObjects();

    const headConfig = useLocaleHead({ baseUrl: "https://example.com" });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.meta).toEqual([
      { property: "og:locale", content: "de_DE" },
      { property: "og:locale:alternate", content: "en" },
      { property: "og:locale:alternate", content: "uk_UA" },
      { property: "og:locale:alternate", content: "fr" },
    ]);
  });

  it("uses each locale's iso for the hreflang of its alternate link", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    withMixedLocaleObjects();

    const headConfig = useLocaleHead({
      baseUrl: "https://example.com",
      addCanonical: false,
    });
    const links = (headConfig.value as Record<string, unknown>).link as Array<
      Record<string, string>
    >;

    expect(links.map((link) => link.hreflang)).toEqual(["en", "de-DE", "uk-UA", "fr", "x-default"]);
  });

  it("omits the dir attribute for a locale that declares no direction", () => {
    setMockRoute({ path: "/about", fullPath: "/about" });
    useState<string>("i18n-locale", () => "en");

    const headConfig = useLocaleHead({ addAlternateLinks: false, addCanonical: false });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.htmlAttrs).toStrictEqual({ lang: "en" });
  });

  it("omits the dir attribute of an rtl locale when addDir is disabled", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    mockRuntimeConfig.public.comvi.localeObjects.de = { code: "de", name: "Deutsch", dir: "rtl" };

    const headConfig = useLocaleHead({
      addDir: false,
      addAlternateLinks: false,
      addCanonical: false,
    });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.htmlAttrs).toStrictEqual({ lang: "de" });
  });

  it("omits htmlAttrs entirely when both lang and dir are disabled", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    mockRuntimeConfig.public.comvi.localeObjects.de = { code: "de", name: "Deutsch", dir: "rtl" };

    const headConfig = useLocaleHead({ addLang: false, addDir: false });
    const head = headConfig.value as Record<string, unknown>;

    expect(head.htmlAttrs).toBeUndefined();
  });

  it("derives the base URL from the request URL when no baseUrl is configured", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");

    const headConfig = useLocaleHead({ addAlternateLinks: false });
    const links = (headConfig.value as Record<string, unknown>).link as Array<
      Record<string, string>
    >;

    expect(links).toEqual([{ rel: "canonical", href: "https://example.com/de/about" }]);
  });

  it("trims a trailing slash from the configured base URL", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");

    const headConfig = useLocaleHead({
      baseUrl: "https://shop.example.com/",
      addAlternateLinks: false,
    });
    const links = (headConfig.value as Record<string, unknown>).link as Array<
      Record<string, string>
    >;

    expect(links).toEqual([{ rel: "canonical", href: "https://shop.example.com/de/about" }]);
  });

  it("emits no links when neither an option nor the request yields a base URL", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");
    vi.spyOn(nuxtAppMocks, "useRequestURL").mockImplementation(() => {
      throw new Error("no request URL outside a request");
    });

    const headConfig = useLocaleHead();
    const head = headConfig.value as Record<string, unknown>;

    expect(head.link).toBeUndefined();
    expect(head.htmlAttrs).toStrictEqual({ lang: "de" });
  });

  it("registers the head configuration with Nuxt", () => {
    const useHeadSpy = vi.spyOn(nuxtAppMocks, "useHead");
    setMockRoute({ path: "/about", fullPath: "/about" });

    const headConfig = useLocaleHead({ baseUrl: "https://example.com" });

    expect(useHeadSpy).toHaveBeenCalledWith(headConfig);
  });

  it("builds canonical and alternate links for current locale", () => {
    setMockRoute({ path: "/de/about", fullPath: "/de/about" });
    useState<string>("i18n-locale", () => "de");

    const headConfig = useLocaleHead({ baseUrl: "https://example.com" });
    const head = headConfig.value as Record<string, unknown>;
    const links = head.link as Array<Record<string, string>>;

    expect(links).toEqual([
      { rel: "canonical", href: "https://example.com/de/about" },
      { rel: "alternate", hreflang: "en", href: "https://example.com/about" },
      { rel: "alternate", hreflang: "de", href: "https://example.com/de/about" },
      { rel: "alternate", hreflang: "uk", href: "https://example.com/uk/about" },
      { rel: "alternate", hreflang: "x-default", href: "https://example.com/about" },
    ]);
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
