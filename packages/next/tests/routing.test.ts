import { describe, it, expect } from "vitest";
import { defineRouting, createGetPathname } from "../src/routing/defineRouting";
import {
  getCanonicalPathname,
  localizeHref,
  localizeUrlObject,
  stripLocalePrefix,
} from "../src/routing/utils";

describe("routing helpers", () => {
  it("creates localized pathnames with as-needed prefix", () => {
    const routing = defineRouting({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      pathnames: {
        "/about": {
          de: "/ueber-uns",
        },
      },
    });

    const getPathname = createGetPathname(routing);

    expect(getPathname({ locale: "en", href: "/about" })).toBe("/about");
    expect(getPathname({ locale: "de", href: "/about" })).toBe("/de/ueber-uns");
    expect(getPathname({ locale: "de", href: "/" })).toBe("/de");
  });

  it("keeps external hrefs intact and preserves query/hash", () => {
    const routing = defineRouting({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      pathnames: {
        "/about": {
          de: "/ueber-uns",
        },
      },
    });

    expect(localizeHref("https://example.com/about", "de", routing)).toBe(
      "https://example.com/about",
    );
    expect(localizeHref("HTTPS://example.com/about", "de", routing)).toBe(
      "HTTPS://example.com/about",
    );
    expect(localizeHref("//cdn.example.com/app.js", "de", routing)).toBe(
      "//cdn.example.com/app.js",
    );
    expect(localizeHref("/about?x=1#top", "de", routing)).toBe("/de/ueber-uns?x=1#top");
    expect(localizeHref("#top", "de", routing)).toBe("#top");
    expect(localizeHref("?tab=1", "de", routing)).toBe("?tab=1");
  });

  it("strips locale prefixes from pathnames", () => {
    expect(stripLocalePrefix("/en/about", ["en", "de"])).toBe("/about");
    expect(stripLocalePrefix("/de", ["en", "de"])).toBe("/");
    expect(stripLocalePrefix("/about", ["en", "de"])).toBe("/about");
  });

  it("localizes href without routing config by normalizing path", () => {
    expect(localizeHref("/about", "de")).toBe("/de/about");
    expect(localizeHref("about", "de")).toBe("/de/about");
    expect(localizeHref("/", "de")).toBe("/de");
    expect(localizeHref("#top", "de")).toBe("#top");
    expect(localizeHref("?tab=1", "de")).toBe("?tab=1");
  });

  it("localizes UrlObject pathnames and keeps protocol URLs unchanged", () => {
    const routing = defineRouting({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      pathnames: {
        "/about": {
          de: "/ueber-uns",
        },
      },
    });

    expect(localizeUrlObject({ pathname: "/about", query: { x: "1" } }, "de", routing)).toEqual({
      pathname: "/de/ueber-uns",
      query: { x: "1" },
    });

    expect(
      localizeUrlObject(
        { protocol: "https:", pathname: "/about", host: "example.com" },
        "de",
        routing,
      ),
    ).toEqual({
      protocol: "https:",
      pathname: "/about",
      host: "example.com",
    });
  });

  it("maps localized slugs back to canonical route keys", () => {
    const routing = defineRouting({
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

    expect(getCanonicalPathname("/about", routing, "de")).toBe("/about");
    expect(getCanonicalPathname("/about-us", routing, "en")).toBe("/about");
    expect(getCanonicalPathname("/ueber-uns", routing, "de")).toBe("/about");
  });

  it("re-localizes already localized slugs across locales", () => {
    const routing = defineRouting({
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

    expect(localizeHref("/de/ueber-uns", "en", routing)).toBe("/about-us");
    expect(localizeHref("/about-us", "de", routing)).toBe("/de/ueber-uns");
    expect(localizeHref("/ueber-uns", "en", routing)).toBe("/about-us");
  });
});
