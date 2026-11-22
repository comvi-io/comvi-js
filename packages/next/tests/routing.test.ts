import { describe, it, expect, vi } from "vitest";
import { defineRouting, createGetPathname, hasLocale } from "../src/routing/defineRouting";
import {
  getCanonicalPathname,
  localizeHref,
  localizeUrlObject,
  stripLocalePrefix,
} from "../src/routing/utils";

// Both configs are immutable, so one instance of each serves every case.
const ROUTING_DE_ONLY = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  pathnames: {
    "/about": {
      de: "/ueber-uns",
    },
  },
});

const ROUTING_BOTH = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  pathnames: {
    "/about": {
      en: "/about-us",
      de: "/ueber-uns",
    },
  },
});

// One route's German slug is another route's canonical English path: the
// collision is what makes the exact-match precedence observable.
const ROUTING_SLUG_COLLISION = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  pathnames: {
    "/about": {
      de: "/ueber-uns",
    },
    "/team": {
      de: "/about",
    },
  },
});

describe("routing helpers", () => {
  it("creates localized pathnames with as-needed prefix", () => {
    const getPathname = createGetPathname(ROUTING_DE_ONLY);

    expect(getPathname({ locale: "en", href: "/about" })).toBe("/about");
    expect(getPathname({ locale: "de", href: "/about" })).toBe("/de/ueber-uns");
    expect(getPathname({ locale: "de", href: "/" })).toBe("/de");
  });

  it("keeps external hrefs intact and preserves query/hash", () => {
    expect(localizeHref("https://example.com/about", "de", ROUTING_DE_ONLY)).toBe(
      "https://example.com/about",
    );
    expect(localizeHref("HTTPS://example.com/about", "de", ROUTING_DE_ONLY)).toBe(
      "HTTPS://example.com/about",
    );
    expect(localizeHref("//cdn.example.com/app.js", "de", ROUTING_DE_ONLY)).toBe(
      "//cdn.example.com/app.js",
    );
    expect(localizeHref("/about?x=1#top", "de", ROUTING_DE_ONLY)).toBe("/de/ueber-uns?x=1#top");
    expect(localizeHref("#top", "de", ROUTING_DE_ONLY)).toBe("#top");
    expect(localizeHref("?tab=1", "de", ROUTING_DE_ONLY)).toBe("?tab=1");
  });

  it("strips locale prefixes from pathnames", () => {
    expect(stripLocalePrefix("/en/about", ["en", "de"])).toBe("/about");
    expect(stripLocalePrefix("/de", ["en", "de"])).toBe("/");
    expect(stripLocalePrefix("/about", ["en", "de"])).toBe("/about");
    expect(stripLocalePrefix("", ["en", "de"])).toBe("/");
    // Segment-based matching: `/ensemble` is not the `en` prefix.
    expect(stripLocalePrefix("/ensemble", ["en", "de"])).toBe("/ensemble");
    expect(stripLocalePrefix("/fr/about", ["en", "de"])).toBe("/fr/about");
    expect(stripLocalePrefix("/de/about/", ["en", "de"])).toBe("/about/");
  });

  it("prefixes a locale that is absent from routing.locales like any other", () => {
    // `localizeHref` is a formatter, not a validator: an unknown locale gets no
    // slug mapping, but it is still prefixed rather than rejected or dropped.
    expect(localizeHref("/about", "fr", ROUTING_BOTH)).toBe("/fr/about");
    expect(localizeHref("/ueber-uns", "fr", ROUTING_BOTH)).toBe("/fr/about");
  });

  it("localizes href without routing config by normalizing path", () => {
    expect(localizeHref("/about", "de")).toBe("/de/about");
    expect(localizeHref("about", "de")).toBe("/de/about");
    expect(localizeHref("/", "de")).toBe("/de");
    expect(localizeHref("#top", "de")).toBe("#top");
    expect(localizeHref("?tab=1", "de")).toBe("?tab=1");
  });

  it("localizes UrlObject pathnames and keeps protocol URLs unchanged", () => {
    expect(
      localizeUrlObject({ pathname: "/about", query: { x: "1" } }, "de", ROUTING_DE_ONLY),
    ).toEqual({
      pathname: "/de/ueber-uns",
      query: { x: "1" },
    });

    expect(
      localizeUrlObject(
        { protocol: "https:", pathname: "/about", host: "example.com" },
        "de",
        ROUTING_DE_ONLY,
      ),
    ).toEqual({
      protocol: "https:",
      pathname: "/about",
      host: "example.com",
    });
  });

  it("maps localized slugs back to canonical route keys", () => {
    expect(getCanonicalPathname("/about", ROUTING_BOTH, "de")).toBe("/about");
    expect(getCanonicalPathname("/about-us", ROUTING_BOTH, "en")).toBe("/about");
    expect(getCanonicalPathname("/ueber-uns", ROUTING_BOTH, "de")).toBe("/about");
  });

  it("re-localizes already localized slugs across locales", () => {
    expect(localizeHref("/de/ueber-uns", "en", ROUTING_BOTH)).toBe("/about-us");
    expect(localizeHref("/about-us", "de", ROUTING_BOTH)).toBe("/de/ueber-uns");
    expect(localizeHref("/ueber-uns", "en", ROUTING_BOTH)).toBe("/about-us");
  });
  it("localizes a path whose segment contains a colon", () => {
    // Only a leading scheme makes an href external; a colon inside a segment
    // is an ordinary character.
    expect(localizeHref("/notes:2024", "de", ROUTING_DE_ONLY)).toBe("/de/notes:2024");
  });

  it("leaves a path that matches no configured route alone", () => {
    expect(getCanonicalPathname("/contact", ROUTING_DE_ONLY, "de")).toBe("/contact");
  });

  it("maps a localized slug back when only that locale is configured for it", () => {
    expect(getCanonicalPathname("/ueber-uns", ROUTING_DE_ONLY, "de")).toBe("/about");
  });

  it("treats an empty href as the root path", () => {
    expect(localizeHref("", "de", ROUTING_DE_ONLY)).toBe("/de");
    expect(localizeUrlObject({ pathname: "" }, "de")).toEqual({ pathname: "/de" });
  });

  it("resolves an empty pathname to the root route", () => {
    expect(getCanonicalPathname("", ROUTING_DE_ONLY, "de")).toBe("/");
  });

  it("maps a localized slug back without being told which locale to prefer", () => {
    expect(getCanonicalPathname("/ueber-uns", ROUTING_DE_ONLY)).toBe("/about");
  });

  it("prefers an exact canonical route over another route's localized slug", () => {
    expect(getCanonicalPathname("/about", ROUTING_SLUG_COLLISION, "de")).toBe("/about");
  });

  it("localizes a UrlObject without routing config and defaults a missing pathname to root", () => {
    expect(localizeUrlObject({ pathname: "/about", query: { x: "1" } }, "de")).toEqual({
      pathname: "/de/about",
      query: { x: "1" },
    });
    expect(localizeUrlObject({ pathname: "about" }, "de")).toEqual({ pathname: "/de/about" });
    expect(localizeUrlObject({ query: { x: "1" } }, "de")).toEqual({
      pathname: "/de",
      query: { x: "1" },
    });
    expect(localizeUrlObject({ query: { x: "1" } }, "de", ROUTING_DE_ONLY)).toEqual({
      pathname: "/de",
      query: { x: "1" },
    });
  });

  /**
   * `stripLocalePrefix` preserves trailing slashes and never rewrites interior
   * bytes, so `/en/about/` strips to `/about/` and `/en//about` to `//about`.
   * Both used to miss the `pathnames` map entirely: the slug was silently
   * bypassed and, for a leading `//`, the locale prefix was applied twice.
   * The map lookup is slash-insensitive now; the OUTPUT still carries the
   * trailing slash the input had (which is where 0.4.1 differs — it dropped
   * the slash whenever a locale prefix happened to be stripped).
   */
  describe("cosmetic slashes do not bypass the pathnames map", () => {
    const NO_PATHNAMES = defineRouting({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    it("maps a trailing-slash path to the localized slug and keeps the slash", () => {
      expect(localizeHref("/en/about/", "de", ROUTING_DE_ONLY)).toBe("/de/ueber-uns/");
      expect(localizeHref("/about/", "de", ROUTING_DE_ONLY)).toBe("/de/ueber-uns/");
      expect(localizeHref("/de/ueber-uns/", "de", ROUTING_DE_ONLY)).toBe("/de/ueber-uns/");
      expect(localizeHref("/en/about/?x=1#top", "de", ROUTING_DE_ONLY)).toBe(
        "/de/ueber-uns/?x=1#top",
      );
    });

    it("maps a path with a duplicated interior slash to the localized slug", () => {
      expect(localizeHref("/en//about", "de", ROUTING_DE_ONLY)).toBe("/de/ueber-uns");
    });

    it("resolves a slash variant back to its canonical route key", () => {
      // What usePathname() returns for /de/ueber-uns/ and /de/about/.
      expect(getCanonicalPathname("/ueber-uns/", ROUTING_DE_ONLY, "de")).toBe("/about/");
      expect(getCanonicalPathname("/about/", ROUTING_DE_ONLY, "de")).toBe("/about/");
      expect(getCanonicalPathname("//about", ROUTING_DE_ONLY, "en")).toBe("/about");
    });

    it("localizes a UrlObject slash variant through the map", () => {
      expect(localizeUrlObject({ pathname: "/en/about/" }, "de", ROUTING_DE_ONLY)).toEqual({
        pathname: "/de/ueber-uns/",
      });
    });

    it("leaves a protocol-relative UrlObject pathname alone instead of prefixing it twice", () => {
      expect(localizeUrlObject({ pathname: "//de/about" }, "de", ROUTING_DE_ONLY)).toEqual({
        pathname: "//de/about",
      });
      // …matching `localizeHref`, which has always treated `//` as external.
      expect(localizeHref("//de/about", "de", ROUTING_DE_ONLY)).toBe("//de/about");
    });

    it("matches a pathnames key or value that itself ends in a slash", () => {
      // Under `trailingSlash: true` people write the map entries WITH the
      // slash. Comparing a trimmed input against an untrimmed key or value
      // missed both directions: the key form self-redirected forever, the
      // value form lost its reverse mapping (a 404).
      const KEY_WITH_SLASH = defineRouting({
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "always",
        pathnames: { "/about/": { en: "/about", de: "/ueber-uns" } },
      });
      expect(getCanonicalPathname("/about/", KEY_WITH_SLASH, "de")).toBe("/about/");
      expect(getCanonicalPathname("/about", KEY_WITH_SLASH, "de")).toBe("/about");
      expect(getCanonicalPathname("/ueber-uns/", KEY_WITH_SLASH, "de")).toBe("/about/");
      // The exact key wins and its value is returned verbatim (no slash added).
      expect(localizeHref("/de/about/", "de", KEY_WITH_SLASH)).toBe("/de/ueber-uns");
      expect(localizeHref("/de/about", "de", KEY_WITH_SLASH)).toBe("/de/ueber-uns");

      const VALUE_WITH_SLASH = defineRouting({
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "always",
        pathnames: { "/about": { en: "/about/", de: "/ueber-uns/" } },
      });
      expect(getCanonicalPathname("/ueber-uns/", VALUE_WITH_SLASH, "de")).toBe("/about/");
      expect(getCanonicalPathname("/ueber-uns", VALUE_WITH_SLASH, "de")).toBe("/about");
    });

    it("never turns a same-origin path into a protocol-relative href", () => {
      // `/en//evil.com` strips to `//evil.com` on the default locale, and
      // `new URL("//evil.com", origin)` is another origin.
      expect(localizeHref("/en//evil.com", "en", NO_PATHNAMES)).toBe("/evil.com");
      expect(localizeHref("//evil.com", "en", NO_PATHNAMES)).toBe("//evil.com"); // external, untouched
      const NEVER = defineRouting({
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "never",
      });
      expect(localizeHref("/de//evil.com", "de", NEVER)).toBe("/evil.com");
      expect(localizeUrlObject({ pathname: "/en//evil.com" }, "en", NO_PATHNAMES)).toEqual({
        pathname: "/evil.com",
      });
    });

    it("keeps the trailing slash when no pathnames map is configured", () => {
      // Nothing to look up, so only the slash rules apply: the trailing slash
      // survives, and a run of slashes left at the START after the locale
      // prefix is stripped collapses to one (the same run that would make
      // `/en//evil.com` protocol-relative). 0.4.1 collapsed everything.
      expect(localizeHref("/en/about/", "de", NO_PATHNAMES)).toBe("/de/about/");
      expect(localizeHref("/en//about", "de", NO_PATHNAMES)).toBe("/de/about");
      expect(getCanonicalPathname("/about/", NO_PATHNAMES, "de")).toBe("/about/");
    });
  });

  it("recognizes configured locales and rejects the rest", () => {
    expect(hasLocale(["en", "de"], "de")).toBe(true);
    expect(hasLocale(["en", "de"], "fr")).toBe(false);
  });

  it("warns when getPathname is asked for a locale outside the configured set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getPathname = createGetPathname(ROUTING_DE_ONLY);

    expect(getPathname({ locale: "fr", href: "/about" })).toBe("/fr/about");

    expect(warn).toHaveBeenCalledWith(
      '[@comvi/next] getPathname: unknown locale "fr". Expected one of: en, de',
    );
  });

  it("does not warn for a configured locale", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getPathname = createGetPathname(ROUTING_DE_ONLY);

    expect(getPathname({ locale: "de", href: "/about" })).toBe("/de/ueber-uns");

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("defineRouting: the shared options schema", () => {
  it("normalizes, through the shared schema, to what the middleware gets from the raw input", async () => {
    const { normalizeRoutingOptions } = await import("@comvi/locale-routing");
    const { defineRouting, NEXT_LOCALE_COOKIE } = await import("../src/routing/defineRouting");
    const input = { locales: ["en", "de"], defaultLocale: "en" } as const;
    const options = { cookieNameDefault: NEXT_LOCALE_COOKIE };

    expect(normalizeRoutingOptions(defineRouting(input), options)).toEqual(
      normalizeRoutingOptions(input, options),
    );
  });

  it("names the shared default prefix mode and next's cookie, and normalizes nothing", async () => {
    const { DEFAULT_LOCALE_PREFIX } = await import("@comvi/locale-routing");
    const { defineRouting } = await import("../src/routing/defineRouting");

    const routing = defineRouting({ locales: ["en"], defaultLocale: "en" });

    expect(routing.localePrefix).toBe(DEFAULT_LOCALE_PREFIX);
    expect(routing.localeCookie).toBe("NEXT_LOCALE");
  });
});

describe("getAlternates: canonical and hreflang for generateMetadata", () => {
  // Imported from the public entry, so the export itself is under test.
  const load = () => import("../src/routing");

  const config = (localePrefix: "as-needed" | "always" | "never") =>
    defineRouting({
      locales: ["en", "uk", "de"],
      defaultLocale: "en",
      localePrefix,
      pathnames: { "/about": { uk: "/pro-nas", de: "/ueber-uns" } },
    });

  describe("as-needed", () => {
    const routing = config("as-needed");
    const languages = { en: "/admin", uk: "/uk/admin", de: "/de/admin", "x-default": "/admin" };

    it("a non-default locale: its prefixed path is canonical, x-default is the default's", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "uk", href: "/admin" })).toStrictEqual({
        canonical: "/uk/admin",
        languages,
      });
    });

    it("the default locale: the unprefixed path is canonical, the languages are the same", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "en", href: "/admin" })).toStrictEqual({
        canonical: "/admin",
        languages,
      });
    });

    it("the root: a non-default locale gets /{locale} with no trailing slash", async () => {
      const { getAlternates } = await load();
      const rootLanguages = { en: "/", uk: "/uk", de: "/de", "x-default": "/" };
      expect(getAlternates(routing, { locale: "uk", href: "/" })).toStrictEqual({
        canonical: "/uk",
        languages: rootLanguages,
      });
      expect(getAlternates(routing, { locale: "en", href: "/" })).toStrictEqual({
        canonical: "/",
        languages: rootLanguages,
      });
    });

    it("pathnames: every locale gets its own slug, the default keeps the canonical key", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/about" })).toStrictEqual({
        canonical: "/de/ueber-uns",
        languages: { en: "/about", uk: "/uk/pro-nas", de: "/de/ueber-uns", "x-default": "/about" },
      });
    });
  });

  describe("always", () => {
    const routing = config("always");
    const languages = {
      en: "/en/admin",
      uk: "/uk/admin",
      de: "/de/admin",
      "x-default": "/en/admin",
    };

    it("a non-default locale", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "uk", href: "/admin" })).toStrictEqual({
        canonical: "/uk/admin",
        languages,
      });
    });

    it("the default locale is prefixed too, and so is x-default", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "en", href: "/admin" })).toStrictEqual({
        canonical: "/en/admin",
        languages,
      });
    });

    it("the root", async () => {
      const { getAlternates } = await load();
      const rootLanguages = { en: "/en", uk: "/uk", de: "/de", "x-default": "/en" };
      expect(getAlternates(routing, { locale: "en", href: "/" })).toStrictEqual({
        canonical: "/en",
        languages: rootLanguages,
      });
      expect(getAlternates(routing, { locale: "de", href: "/" })).toStrictEqual({
        canonical: "/de",
        languages: rootLanguages,
      });
    });

    it("pathnames", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "uk", href: "/about" })).toStrictEqual({
        canonical: "/uk/pro-nas",
        languages: {
          en: "/en/about",
          uk: "/uk/pro-nas",
          de: "/de/ueber-uns",
          "x-default": "/en/about",
        },
      });
    });
  });

  describe("never: every locale shares one URL, so there is a canonical and no hreflang", () => {
    const routing = config("never");

    it("a nested path, default and non-default locale", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "uk", href: "/admin" })).toStrictEqual({
        canonical: "/admin",
      });
      expect(getAlternates(routing, { locale: "en", href: "/admin" })).toStrictEqual({
        canonical: "/admin",
      });
    });

    it("the root, default and non-default locale", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/" })).toStrictEqual({ canonical: "/" });
      expect(getAlternates(routing, { locale: "en", href: "/" })).toStrictEqual({ canonical: "/" });
    });

    it("pathnames still pick the locale's slug", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/about" })).toStrictEqual({
        canonical: "/ueber-uns",
      });
    });
  });

  it("returns, for every locale, exactly what getPathname returns", async () => {
    const { getAlternates, createGetPathname } = await load();
    for (const mode of ["as-needed", "always"] as const) {
      const routing = config(mode);
      const getPathname = createGetPathname(routing);
      for (const href of ["/", "/admin", "/about", "/about/"]) {
        const { canonical, languages } = getAlternates(routing, { locale: "uk", href });
        expect(canonical).toBe(getPathname({ locale: "uk", href }));
        for (const locale of routing.locales) {
          expect(languages?.[locale]).toBe(getPathname({ locale, href }));
        }
        expect(languages?.["x-default"]).toBe(getPathname({ locale: "en", href }));
      }
    }
  });

  // `href` must be the `pathnames` key: no locale prefix, no query, no hash. Unlike `<Link>`,
  // nothing here strips a prefix or maps a slug back; these pin what other input gives today.
  describe("an href that is not a pathnames key is taken as it is", () => {
    const routing = config("as-needed");

    it("a query and hash are kept on every URL, and a query hides the pathnames key", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/admin?tab=1#top" })).toStrictEqual({
        canonical: "/de/admin?tab=1#top",
        languages: {
          en: "/admin?tab=1#top",
          uk: "/uk/admin?tab=1#top",
          de: "/de/admin?tab=1#top",
          "x-default": "/admin?tab=1#top",
        },
      });
      expect(getAlternates(routing, { locale: "de", href: "/about?tab=1" }).canonical).toBe(
        "/de/about?tab=1",
      );
    });

    it("a locale prefix is not stripped: it is prefixed again", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/uk/admin" })).toStrictEqual({
        canonical: "/de/uk/admin",
        languages: {
          en: "/uk/admin",
          uk: "/uk/uk/admin",
          de: "/de/uk/admin",
          "x-default": "/uk/admin",
        },
      });
    });

    it("a localized slug is not mapped back to its key", async () => {
      const { getAlternates } = await load();
      expect(getAlternates(routing, { locale: "de", href: "/ueber-uns" })).toStrictEqual({
        canonical: "/de/ueber-uns",
        languages: {
          en: "/ueber-uns",
          uk: "/uk/ueber-uns",
          de: "/de/ueber-uns",
          "x-default": "/ueber-uns",
        },
      });
    });
  });

  it("an unknown locale: warns like getPathname, does not throw, lists the configured locales", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAlternates, createGetPathname } = await load();
    const routing = config("as-needed");

    const alternates = getAlternates(routing, { locale: "fr", href: "/admin" });

    expect(alternates).toStrictEqual({
      canonical: createGetPathname(routing)({ locale: "fr", href: "/admin" }),
      languages: { en: "/admin", uk: "/uk/admin", de: "/de/admin", "x-default": "/admin" },
    });
    expect(alternates.canonical).toBe("/fr/admin");
    expect(warn).toHaveBeenCalledWith(
      '[@comvi/next] getAlternates: unknown locale "fr". Expected one of: en, uk, de',
    );
    warn.mockRestore();
  });

  it("does not warn for a configured locale", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAlternates } = await load();

    getAlternates(config("always"), { locale: "de", href: "/admin" });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
