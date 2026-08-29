/**
 * Table-driven reconciliation matrix for @comvi/locale-routing.
 *
 * The `nextOld` / `nuxtOld` columns record what packages/next and packages/nuxt
 * each did before the shared extraction; `shared` is the reconciled behavior
 * that wins where they disagree.
 */
import { describe, expect, it } from "vitest";
import {
  buildLocalizedPath,
  extractLocaleFromPath,
  setQueryParamInSuffix,
  splitPathAndSuffix,
  stripLocalePrefix,
} from "../src/index";
import type { LocalePrefixMode } from "../src/index";

const LOCALES = ["en", "de", "uk"] as const;

describe("extractLocaleFromPath (identical in both stacks — nuxt locale-path.ts + next middleware)", () => {
  const table: Array<[path: string, expected: string | undefined]> = [
    ["/de/about", "de"],
    ["/de", "de"],
    ["/de/", "de"],
    ["/en/about", "en"],
    ["/about", undefined],
    // segment-based: "/ensemble" must NOT match "en"
    ["/ensemble", undefined],
    ["/", undefined],
    ["", undefined],
    ["/DE/about", undefined], // case-sensitive, as in both stacks
    ["/uk/de/about", "uk"], // only the FIRST segment is consulted
  ];

  it.each(table)("extractLocaleFromPath(%j) -> %j", (path, expected) => {
    expect(extractLocaleFromPath(path, LOCALES)).toBe(expected);
  });
});

describe("stripLocalePrefix (reconciled: segment matching [next] + trailing-slash preservation [nuxt])", () => {
  // `shared` is the asserted expectation and therefore comes second, so the row
  // title prints it; the historical columns follow as documentation.
  const table: Array<[input: string, shared: string, nextOld: string, nuxtOld: string]> = [
    ["/de/about", "/about", "/about", "/about"],
    ["/de", "/", "/", "/"],
    ["/de/", "/", "/", "/"],
    ["/about", "/about", "/about", "/about"],
    ["/ensemble", "/ensemble", "/ensemble", "/ensemble"],
    ["/", "/", "/", "/"],
    ["/de/de/about", "/de/about", "/de/about", "/de/about"], // only first prefix stripped
    // CONFLICT: trailing slash — nuxt wins (preserve)
    ["/de/about/", "/about/", "/about", "/about/"],
    ["/de/about/team/", "/about/team/", "/about/team", "/about/team/"],
    // CONFLICT: input normalization — next wins (leading slash added)
    ["", "/", "/", ""],
    ["about", "/about", "/about", "about"],
    ["de/about", "/about", "/about", "de/about"],
    // CONFLICT: interior duplicate slashes — preserved verbatim (next collapsed)
    ["/de//about", "//about", "/about", "//about"],
    // no-first-segment-match oddities stay untouched
    ["//de/about", "//de/about", "/de/about", "//de/about"],
    ["/DE/about", "/DE/about", "/DE/about", "/DE/about"],
  ];

  it.each(table)("stripLocalePrefix(%j) -> %j", (input, shared) => {
    expect(stripLocalePrefix(input, LOCALES)).toBe(shared);
  });
});

describe("splitPathAndSuffix (verified-identical in both stacks: next splitHref / nuxt splitPathAndSuffix)", () => {
  const table: Array<[input: string, pathname: string, suffix: string]> = [
    ["/about?x=1#top", "/about", "?x=1#top"],
    ["/about#top", "/about", "#top"],
    ["/about?x=1", "/about", "?x=1"],
    ["/about", "/about", ""],
    ["?tab=1", "", "?tab=1"],
    ["#top", "", "#top"],
    ["/a?b#c?d", "/a", "?b#c?d"], // split at FIRST ? or #
    ["/a#b?c", "/a", "#b?c"],
    ["", "", ""],
  ];

  it.each(table)("splitPathAndSuffix(%j) -> {%j, %j}", (input, pathname, suffix) => {
    expect(splitPathAndSuffix(input)).toEqual({ pathname, suffix });
  });
});

describe("setQueryParamInSuffix (nuxt-only feature, exported on shared primitives; next does not call it)", () => {
  const table: Array<[suffix: string, key: string, value: string, expected: string]> = [
    ["", "lang", "de", "?lang=de"],
    ["?a=1", "lang", "de", "?a=1&lang=de"],
    ["?lang=uk", "lang", "de", "?lang=de"],
    // in-place replacement keeps position; unrelated params and hash preserved
    ["?lang=uk&sort=asc#details", "lang", "de", "?lang=de&sort=asc#details"],
    ["#top", "lang", "de", "?lang=de#top"],
    // duplicate occurrences collapse to one value
    ["?lang=a&x=1&lang=b", "lang", "de", "?lang=de&x=1"],
    // encoded key occurrences are recognized
    ["?la%6Eg=uk", "lang", "de", "?lang=de"],
    // '+' decodes as space when matching keys
    ["?my+key=1", "my key", "v", "?my%20key=v"],
    // malformed unrelated segments preserved verbatim
    ["?bad=%zz&x=1", "lang", "de", "?bad=%zz&x=1&lang=de"],
    // key/value are encoded on write
    ["", "sp ace", "a&b", "?sp%20ace=a%26b"],
  ];

  it.each(table)("setQueryParamInSuffix(%j, %j, %j) -> %j", (suffix, key, value, expected) => {
    expect(setQueryParamInSuffix(suffix, key, value)).toBe(expected);
  });
});

describe("buildLocalizedPath (nuxt buildLocalizedPath ∪ next createGetPathname/pathnames-map)", () => {
  const base = { defaultLocale: "en", localePrefix: "always" as const };

  describe("prefix modes (both stacks agreed)", () => {
    const table: Array<
      [path: string, locale: string, mode: "always" | "as-needed" | "never", expected: string]
    > = [
      ["/about", "de", "always", "/de/about"],
      ["/about", "en", "always", "/en/about"],
      ["/about", "de", "as-needed", "/de/about"],
      ["/about", "en", "as-needed", "/about"],
      ["/about", "de", "never", "/about"],
      ["/about", "en", "never", "/about"],
      // root never gets a trailing slash when prefixed
      ["/", "de", "always", "/de"],
      ["/", "en", "as-needed", "/"],
      ["/", "de", "as-needed", "/de"],
      // leading slash normalization
      ["about", "de", "always", "/de/about"],
      ["about", "en", "as-needed", "/about"],
      // trailing slash preservation
      ["/about/", "de", "always", "/de/about/"],
      ["/about/", "en", "as-needed", "/about/"],
      ["/about/", "en", "always", "/en/about/"],
    ];

    it.each(table)("buildLocalizedPath(%j, %j, %j) -> %j", (path, locale, mode, expected) => {
      expect(buildLocalizedPath(path, locale, { defaultLocale: "en", localePrefix: mode })).toBe(
        expected,
      );
    });
  });

  describe("pathnames map (next-only feature, optional; nuxt passes none today)", () => {
    const pathnames = {
      "/about": { de: "/ueber-uns", uk: "/pro-nas" },
      "/": { de: "/" },
    };

    it("maps the canonical path to the locale-specific slug before prefixing", () => {
      expect(buildLocalizedPath("/about", "de", { ...base, pathnames })).toBe("/de/ueber-uns");
      expect(buildLocalizedPath("/about", "uk", { ...base, pathnames })).toBe("/uk/pro-nas");
    });

    it("falls back to the canonical path when no mapping exists for the locale", () => {
      expect(buildLocalizedPath("/about", "en", { ...base, pathnames })).toBe("/en/about");
      expect(
        buildLocalizedPath("/about", "en", {
          defaultLocale: "en",
          localePrefix: "as-needed",
          pathnames,
        }),
      ).toBe("/about");
    });

    it("falls back for paths absent from the map", () => {
      expect(buildLocalizedPath("/contact", "de", { ...base, pathnames })).toBe("/de/contact");
    });

    it("looks up by the exact given path (next-pinned: no normalization before lookup)", () => {
      // "about" (no leading slash) is not a key in the map -> falls through, then normalized
      expect(buildLocalizedPath("about", "de", { ...base, pathnames })).toBe("/de/about");
    });
  });

  describe("degenerate config reachable from next's option surface", () => {
    it("leaves the path untouched when the locale list is empty", () => {
      expect(extractLocaleFromPath("/de/about", [])).toBeUndefined();
      expect(stripLocalePrefix("/de/about", [])).toBe("/de/about");
    });

    it("treats an unknown localePrefix as no prefixing", () => {
      expect(
        buildLocalizedPath("/about", "de", {
          defaultLocale: "en",
          localePrefix: "sometimes" as LocalePrefixMode,
        }),
      ).toBe("/about");
    });

    it("falls back to the canonical path when a pathnames entry is undefined", () => {
      expect(
        buildLocalizedPath("/about", "de", { ...base, pathnames: { "/about": { de: undefined } } }),
      ).toBe("/de/about");
    });
  });

  describe("round-trips with stripLocalePrefix", () => {
    const modes = ["always", "as-needed"] as const;
    const paths = ["/", "/about", "/about/", "/nested/deep"];

    for (const mode of modes) {
      for (const path of paths) {
        for (const locale of LOCALES) {
          it(`strip(build(${path}, ${locale}, ${mode})) === ${path}`, () => {
            const built = buildLocalizedPath(path, locale, {
              defaultLocale: "en",
              localePrefix: mode,
            });
            expect(stripLocalePrefix(built, LOCALES)).toBe(path);
          });
        }
      }
    }
  });
});
