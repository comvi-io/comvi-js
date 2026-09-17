import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { ACCEPT_LANGUAGE_CASES } from "@comvi/test-utils/acceptLanguageTable";
import { createMiddleware } from "../src/middleware/createMiddleware";

/**
 * Half of the Next/Nuxt Accept-Language contract: the same table
 * `packages/nuxt/tests/accept-language-parity.test.ts` runs through nuxt's
 * public resolver, run here END TO END through next's middleware — the only
 * Accept-Language entry point this package has. See
 * `docs/design/next-nuxt-parity.md`.
 *
 * `localePrefix: "never"` keeps every row on one URL so the response is always
 * readable, and the resolved locale comes off `x-comvi-locale`. Where the table
 * says no locale is acceptable, next's documented answer is `defaultLocale` —
 * that substitution is the ONLY difference between the two callers, and it
 * belongs to the middleware's fallback, not to the matcher.
 */
describe("next's middleware resolves the shared Accept-Language table", () => {
  for (const { header, locales, expected, why } of ACCEPT_LANGUAGE_CASES) {
    const defaultLocale = locales[0]!;
    it(`${JSON.stringify(header)} over ${JSON.stringify(locales)} → ${String(expected)} — ${why}`, () => {
      const middleware = createMiddleware({
        locales: [...locales],
        defaultLocale,
        localePrefix: "never",
      });
      const request = new NextRequest("https://example.com/", {
        headers: { "accept-language": header },
      });

      const response = middleware(request);

      expect(response.headers.get("x-comvi-locale")).toBe(expected ?? defaultLocale);
    });
  }
});

/**
 * The table above passed while next and nuxt each carried their own copy of
 * these twenty lines — identical semantics, two files. This is the part that
 * did not: next's middleware must have no matcher of its own.
 */
describe("next has no Accept-Language parser of its own", () => {
  const source = readFileSync(resolve(__dirname, "../src/middleware/createMiddleware.ts"), "utf8");

  it("imports the resolver from the shared locale-routing package", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bresolveAcceptLanguage\b[^}]*\}\s*from\s*"@comvi\/locale-routing"/s,
    );
  });

  it("parses nothing locally: no q-value arithmetic in this file", () => {
    expect(source).not.toContain("parseFloat");
    expect(source).not.toContain("defaultResolveAcceptLanguage");
  });
});

/**
 * The header is one source among several, and moving the matcher must not have
 * changed where it sits in the order.
 */
describe("Accept-Language stays in its place in next's detection order", () => {
  const middleware = createMiddleware({
    locales: ["en", "de", "fr"],
    defaultLocale: "en",
    localePrefix: "never",
  });

  // `cookie` is a forbidden header under happy-dom, so the request cookie has
  // to go through `NextRequest.cookies.set()` — same note as
  // `middleware.test.ts`.
  it("loses to a cookie, which the default order consults first", () => {
    const request = new NextRequest("https://example.com/", {
      headers: { "accept-language": "fr" },
    });
    request.cookies.set("NEXT_LOCALE", "de");

    expect(middleware(request).headers.get("x-comvi-locale")).toBe("de");
  });

  it("is still consulted when the cookie names an unconfigured locale", () => {
    const request = new NextRequest("https://example.com/", {
      headers: { "accept-language": "fr" },
    });
    request.cookies.set("NEXT_LOCALE", "ja");

    expect(middleware(request).headers.get("x-comvi-locale")).toBe("fr");
  });

  it("hands a caller's own resolveAcceptLanguage the raw header", () => {
    const seen: string[] = [];
    const custom = createMiddleware({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "never",
      localeDetection: {
        order: ["accept-language"],
        resolveAcceptLanguage: (header) => {
          seen.push(header);
          return "de";
        },
      },
    });

    const response = custom(
      new NextRequest("https://example.com/", { headers: { "accept-language": "fr;q=0" } }),
    );

    expect(seen).toEqual(["fr;q=0"]);
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });
});
