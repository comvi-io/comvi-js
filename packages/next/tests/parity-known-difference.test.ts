import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createMiddleware } from "../src/middleware/createMiddleware";

/**
 * The ONE behavioural difference between `@comvi/next` and `@comvi/nuxt` that
 * `docs/design/next-nuxt-parity.md` records rather than removes: a prefixless
 * non-root URL under `localePrefix: "as-needed"` is redirected to the stored
 * locale here, because that is what a next-intl app expects. nuxt reads the same
 * URL as the default locale and serves it.
 * `packages/nuxt/tests/parity-known-difference.test.ts` pins nuxt's half.
 *
 * Both halves are pinned so the record cannot go stale silently. When the
 * shared option lands after RC, BOTH tests change together and the record's
 * plan paragraph is what says so.
 */
describe("known Next/Nuxt difference: prefixless path vs stored locale", () => {
  const middleware = createMiddleware({
    locales: ["en", "de"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  });

  // `cookie` is a forbidden header under happy-dom, so it goes through
  // `NextRequest.cookies.set()` — same note as `middleware.test.ts`.
  it("redirects /about to /de/about when the cookie says de", () => {
    const request = new NextRequest("https://example.com/about");
    request.cookies.set("NEXT_LOCALE", "de");

    const response = middleware(request);

    expect(response.headers.get("location")).toBe("https://example.com/de/about");
    expect(response.headers.get("x-comvi-locale")).toBe("de");
  });

  it("serves the default locale for /about when there is no stored preference", () => {
    const response = middleware(new NextRequest("https://example.com/about"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-comvi-locale")).toBe("en");
  });

  it("redirects the root path to the stored locale too, which is where the two agree", () => {
    const request = new NextRequest("https://example.com/");
    request.cookies.set("NEXT_LOCALE", "de");

    expect(middleware(request).headers.get("location")).toBe("https://example.com/de");
  });
});
