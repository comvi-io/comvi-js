import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createMiddleware } from "../src/middleware/createMiddleware";

const RECOMMENDED_MATCHER =
  "/((?!api|_next|_vercel|.*\\.(?:avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|map|mjs|mp3|mp4|otf|pdf|png|svg|txt|ttf|wav|webm|webmanifest|webp|woff|woff2|xml|zip)$).*)";

describe("middleware locale prefix handling", () => {
  const middleware = createMiddleware({
    locales: ["en", "fr"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  });

  it("removes default locale prefix in as-needed mode", () => {
    const request = new NextRequest("https://example.com/en/about");
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/about");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("adds non-default locale prefix based on Accept-Language", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/fr/about");
    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("adds non-default locale prefix for root path without trailing slash", () => {
    const request = new NextRequest("https://example.com/", {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/fr");
    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("rewrites to default locale when none detected", () => {
    const request = new NextRequest("https://example.com/about");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
    expect(response.headers.get("x-middleware-request-x-comvi-locale")).toBe("en");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("removes locale prefix in never mode", () => {
    const neverMiddleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "never",
    });
    const request = new NextRequest("https://example.com/fr/about");
    const response = neverMiddleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/about");
    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("always adds locale prefix when missing", () => {
    const alwaysMiddleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "always",
    });
    const request = new NextRequest("https://example.com/about");
    const response = alwaysMiddleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/en/about");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("always mode redirects root path without trailing slash", () => {
    const alwaysMiddleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "always",
    });
    const request = new NextRequest("https://example.com/");
    const response = alwaysMiddleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/en");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });
});

describe("middleware locale detection priority", () => {
  it("cookie locale takes priority over Accept-Language", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    // Cookie says "de", Accept-Language says "fr"
    // Note: Setting cookie via headers doesn't work in happy-dom (forbidden header).
    // Use NextRequest.cookies.set() instead.
    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr;q=1.0,en;q=0.5",
      },
    });
    request.cookies.set("NEXT_LOCALE", "de");
    const response = middleware(request);

    // Cookie should win — locale detected as "de"
    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.headers.get("location")).toBe("https://example.com/de/about");
  });

  it("falls back to default locale for unsupported Accept-Language", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "ja-JP,ja;q=0.9,zh;q=0.8",
      },
    });
    const response = middleware(request);

    // None of the Accept-Language values match supported locales, so default "en" is used
    expect(response.headers.get("x-comvi-locale")).toBe("en");
    // Default locale in as-needed mode rewrites (no redirect)
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
  });

  it("ignores locales with q=0 in Accept-Language", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr;q=0,en;q=0.8",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("en");
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
  });

  it("supports custom header detection when configured in order", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeDetection: {
        order: ["header", "accept-language"],
        headerName: "x-user-locale",
      },
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "x-user-locale": "de",
        "accept-language": "fr;q=1.0,en;q=0.5",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.headers.get("location")).toBe("https://example.com/de/about");
  });

  it("skips locale handling for internal Next.js paths", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/_next/static/chunk.js");
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not skip routes that only start with /api prefix", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/apix", {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/fr/apix");
    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("does not skip app routes that contain dots", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/john.doe", {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/fr/john.doe");
    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("processes static-like paths when matcher allows them", () => {
    const middleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/assets/app.js", {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
    expect(response.headers.get("location")).toBe("https://example.com/fr/assets/app.js");
  });
});

describe("middleware localized pathname mappings", () => {
  const middleware = createMiddleware({
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

  it("rewrites localized slugs to internal canonical routes", () => {
    const request = new NextRequest("https://example.com/de/ueber-uns");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/de/about");
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });

  it("redirects canonical non-default routes to the localized public slug", () => {
    const request = new NextRequest("https://example.com/de/about");
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/de/ueber-uns");
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });

  it("rewrites default-locale localized slugs without a prefix", () => {
    const request = new NextRequest("https://example.com/about-us");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("redirects the default-locale canonical route to the localized public slug", () => {
    const request = new NextRequest("https://example.com/about");
    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/about-us");
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("supports localized slugs in always mode", () => {
    const alwaysMiddleware = createMiddleware({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "always",
      pathnames: {
        "/about": {
          en: "/about-us",
          de: "/ueber-uns",
        },
      },
    });

    const request = new NextRequest("https://example.com/de/ueber-uns");
    const response = alwaysMiddleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/de/about");
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });

  it("supports localized slugs in never mode", () => {
    const neverMiddleware = createMiddleware({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "never",
      pathnames: {
        "/about": {
          en: "/about-us",
          de: "/ueber-uns",
        },
      },
      localeDetection: {
        order: ["cookie"],
      },
    });

    const request = new NextRequest("https://example.com/ueber-uns");
    request.cookies.set("NEXT_LOCALE", "de");

    const response = neverMiddleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/de/about");
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });
});

describe("middleware matcher preset", () => {
  const matcherRegex = new RegExp(`^${RECOMMENDED_MATCHER}$`);

  it("matches dotted app routes", () => {
    expect(matcherRegex.test("/john.doe")).toBe(true);
  });

  it("excludes common static assets and internals", () => {
    expect(matcherRegex.test("/assets/app.js")).toBe(false);
    expect(matcherRegex.test("/api/users")).toBe(false);
    expect(matcherRegex.test("/_next/static/chunk.js")).toBe(false);
  });
});
