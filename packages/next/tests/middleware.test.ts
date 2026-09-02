import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMiddleware } from "../src/middleware/createMiddleware";
import type { LocaleDetectionSource } from "../src/middleware/types";

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
  // The middleware closure is immutable, so one instance serves every case
  // that does not need its own configuration.
  const middleware = createMiddleware({
    locales: ["en", "fr"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  });

  it("cookie locale takes priority over Accept-Language", () => {
    const trilingual = createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    // Setting a cookie via headers does not work in happy-dom (forbidden
    // header) — it has to go through NextRequest.cookies.set().
    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr;q=1.0,en;q=0.5",
      },
    });
    request.cookies.set("NEXT_LOCALE", "de");
    const response = trilingual(request);

    // The cookie wins over Accept-Language.
    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.headers.get("location")).toBe("https://example.com/de/about");
  });

  it("falls back to default locale for unsupported Accept-Language", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "ja-JP,ja;q=0.9,zh;q=0.8",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("en");
    // The default locale in as-needed mode rewrites rather than redirecting.
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
  });

  it("ignores locales with q=0 in Accept-Language", () => {
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
    const headerFirst = createMiddleware({
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
    const response = headerFirst(request);

    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.headers.get("location")).toBe("https://example.com/de/about");
  });

  it("skips locale handling for internal Next.js paths", () => {
    const request = new NextRequest("https://example.com/_next/static/chunk.js");
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it.each([["/api"], ["/api/users"]])("skips locale handling for the API route %s", (pathname) => {
    const request = new NextRequest(`https://example.com${pathname}`, {
      headers: {
        "accept-language": "fr",
      },
    });
    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("a custom detectLocale outranks the cookie and Accept-Language", () => {
    const withDetector = createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      detectLocale: () => "de",
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr;q=1.0,en;q=0.5",
      },
    });
    request.cookies.set("NEXT_LOCALE", "fr");
    const response = withDetector(request);

    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.headers.get("location")).toBe("https://example.com/de/about");
  });

  it.each([
    ["a cookie", (request: NextRequest) => request.cookies.set("NEXT_LOCALE", "zz")],
    ["a custom header", (request: NextRequest) => request.headers.set("x-user-locale", "zz")],
  ])("falls back to defaultLocale when %s names an unsupported locale", (_source, poison) => {
    const headerAware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeDetection: {
        order: ["cookie", "header"],
        headerName: "x-user-locale",
      },
    });

    const request = new NextRequest("https://example.com/about");
    poison(request);
    const response = headerAware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("en");
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en/about");
  });

  it("does not skip routes that only start with /api prefix", () => {
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

describe("middleware locale cookie persistence", () => {
  const middleware = createMiddleware({
    locales: ["en", "fr"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  });

  it("writes the resolved locale to the response cookie with the persistence attributes", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr",
      },
    });

    const response = middleware(request);

    expect(response.cookies.get("NEXT_LOCALE")).toMatchObject({
      value: "fr",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
    });
    expect(response.cookies.get("NEXT_LOCALE")?.secure).toBe(true);
  });

  it("honours an explicit cookieSecure: false", () => {
    const insecureCookie = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeDetection: { cookieSecure: false },
    });

    const request = new NextRequest("https://example.com/about", {
      headers: { "accept-language": "fr" },
    });

    const response = insecureCookie(request);

    expect(response.cookies.get("NEXT_LOCALE")?.secure).toBe(false);
  });

  it("skips the cookie write when the request cookie already carries the resolved locale", () => {
    const request = new NextRequest("https://example.com/fr/about");
    request.cookies.set("NEXT_LOCALE", "fr");

    const response = middleware(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
    // The URL already IS the internal path, so the request passes through
    // without a rewrite.
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("honours a custom cookie name from localeDetection", () => {
    const customCookie = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeDetection: { order: ["accept-language"], cookieName: "MY_LOCALE" },
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr",
      },
    });

    const response = customCookie(request);

    expect(response.cookies.get("MY_LOCALE")?.value).toBe("fr");
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });

  it("drops the secure flag in development so localhost HTTP keeps the cookie", () => {
    // `isDev` is read once, when the middleware closure is built.
    vi.stubEnv("NODE_ENV", "development");
    const devMiddleware = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });

    const request = new NextRequest("https://example.com/about", {
      headers: {
        "accept-language": "fr",
      },
    });

    const response = devMiddleware(request);

    expect(response.cookies.get("NEXT_LOCALE")?.secure).toBe(false);
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

describe("middleware detection sources", () => {
  const trilingual = (localeDetection?: { order?: LocaleDetectionSource[]; headerName?: string }) =>
    createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      localeDetection,
    });

  it("keeps a custom detector's locale even when the path carries another one", () => {
    const withDetector = createMiddleware({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      detectLocale: () => "de",
    });

    const response = withDetector(new NextRequest("https://example.com/fr/about"));

    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });

  it("falls back to the default locale when the custom detector names an unsupported locale", () => {
    const withDetector = createMiddleware({
      locales: ["en", "fr"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      detectLocale: () => "zz",
    });

    const response = withDetector(new NextRequest("https://example.com/about"));

    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("moves past a cookie naming an unsupported locale to the next source", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: { "accept-language": "fr" },
    });
    request.cookies.set("NEXT_LOCALE", "zz");

    const response = trilingual()(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("moves past a custom header naming an unsupported locale to the next source", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: { "x-user-locale": "zz", "accept-language": "fr" },
    });

    const response = trilingual({
      order: ["header", "accept-language"],
      headerName: "x-user-locale",
    })(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("skips the header source when no header name is configured", () => {
    const request = new NextRequest("https://example.com/about", {
      headers: { "x-user-locale": "de", "accept-language": "fr" },
    });

    const response = trilingual({ order: ["header", "accept-language"] })(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("detects nothing from an unrecognized source and keeps going", () => {
    const order = ["bogus", "accept-language"] as unknown as LocaleDetectionSource[];
    const request = new NextRequest("https://example.com/about", {
      headers: { "accept-language": "fr" },
    });

    const response = trilingual({ order })(request);

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
  });

  it("falls back to the default locale when the only source is unrecognized", () => {
    const order = ["bogus"] as unknown as LocaleDetectionSource[];
    const request = new NextRequest("https://example.com/about", {
      headers: { "accept-language": "fr" },
    });

    const response = trilingual({ order })(request);

    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });
});

describe("middleware Accept-Language parsing", () => {
  const resolvedLocale = (
    acceptLanguage: string,
    locales: string[] = ["en", "fr"],
    defaultLocale = "en",
  ): string | null =>
    createMiddleware({ locales, defaultLocale, localePrefix: "as-needed" })(
      new NextRequest("https://example.com/about", {
        headers: { "accept-language": acceptLanguage },
      }),
    ).headers.get("x-comvi-locale");

  it("picks the highest-quality language when it is listed last", () => {
    expect(resolvedLocale("en;q=0.5,fr;q=1.0")).toBe("fr");
  });

  it("picks the highest-quality language when it is listed first", () => {
    expect(resolvedLocale("fr;q=1.0,en;q=0.5")).toBe("fr");
  });

  it("treats a language with no explicit quality as the most preferred", () => {
    expect(resolvedLocale("fr,en;q=0.9")).toBe("fr");
  });

  it("ignores a language explicitly refused with q=0", () => {
    expect(resolvedLocale("fr;q=0")).toBe("en");
  });

  it("treats a quality parameter with no value as the most preferred", () => {
    expect(resolvedLocale("fr;q,en;q=0.9")).toBe("fr");
  });

  it("ignores an unparsable quality and treats the entry as most preferred", () => {
    expect(resolvedLocale("fr;q=nonsense,en;q=0.9")).toBe("fr");
  });

  it("tolerates the whitespace browsers put after the entry separator", () => {
    expect(resolvedLocale("en;q=0.5, fr;q=1.0")).toBe("fr");
  });

  it("tolerates whitespace before the quality separator", () => {
    expect(resolvedLocale("fr ;q=1.0")).toBe("fr");
  });

  it("prefers an exactly matching regional locale over its base language", () => {
    expect(resolvedLocale("en-GB", ["en", "en-GB"])).toBe("en-GB");
  });

  it("matches case-insensitively", () => {
    expect(resolvedLocale("FR", ["en", "fr"])).toBe("fr");
  });

  it("falls back to the base language when the requested region is not configured", () => {
    expect(resolvedLocale("fr-CA", ["de", "fr"], "de")).toBe("fr");
  });

  it("falls back to a configured regional variant when the base language is requested", () => {
    expect(resolvedLocale("en", ["en-US", "fr"], "fr")).toBe("en-US");
  });

  it("keeps looking when the most preferred language matches nothing", () => {
    expect(resolvedLocale("ja,fr;q=0.9")).toBe("fr");
  });

  it("does not match a different language that merely starts with the same letters", () => {
    // "fi" (Finnish) must not resolve to "fil" (Filipino).
    expect(resolvedLocale("fi", ["fil", "en"], "en")).toBe("en");
  });
});

describe("middleware internal pathname", () => {
  const middleware = createMiddleware({
    locales: ["en", "fr"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  });

  it("passes the localized root through without a rewrite or redirect", () => {
    const response = middleware(new NextRequest("https://example.com/fr"));

    expect(response.headers.get("x-comvi-locale")).toBe("fr");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("rewrites the root path to the bare locale segment", () => {
    const request = new NextRequest("https://example.com/", {
      headers: { "accept-language": "en" },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.com/en");
  });
});
