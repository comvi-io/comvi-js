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

    it("keeps the slashes byte-for-byte when no pathnames map is configured", () => {
      // Nothing to look up, so the documented "interior bytes are never
      // rewritten" rule is all that applies. 0.4.1 collapsed both.
      expect(localizeHref("/en/about/", "de", NO_PATHNAMES)).toBe("/de/about/");
      expect(localizeHref("/en//about", "de", NO_PATHNAMES)).toBe("/de//about");
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

    expect(warn).toHaveBeenCalledWith('[getPathname] Unknown locale "fr". Expected one of: en, de');
  });

  it("does not warn for a configured locale", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getPathname = createGetPathname(ROUTING_DE_ONLY);

    expect(getPathname({ locale: "de", href: "/about" })).toBe("/de/ueber-uns");

    expect(warn).not.toHaveBeenCalled();
  });
});
