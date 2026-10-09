// @vitest-environment node
// Node, not happy-dom: `Sec-Fetch-Dest` is a forbidden request header in a
// browser-like environment, which drops it from a `Request` built in a test.
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createMiddleware } from "../src/middleware/createMiddleware";
import type { RoutingConfig } from "../src/routing/types";

const AS_NEEDED: RoutingConfig = {
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
};

describe("the middleware records a page the browser loads, not a fetch the client router makes", () => {
  // Next fetches pages in the background: it prefetches a page's links and, on
  // Next 16, re-prefetches the links of the page being LEFT after a navigation.
  // Those requests carry the new cookie to the old locale's URLs. Recording
  // them moved the cookie back to the locale just left, and the next URL that
  // names no locale was answered with it again. Next removes its own prefetch
  // header before middleware runs, so `Sec-Fetch-Dest` is what tells a
  // document load from a client-router fetch.
  const request = (href: string, dest: string | undefined, cookieLocale?: string): NextRequest => {
    const built = new NextRequest(`http://localhost:3000${href}`, {
      headers: dest === undefined ? {} : { "sec-fetch-dest": dest },
    });
    if (cookieLocale) built.cookies.set("NEXT_LOCALE", cookieLocale);
    return built;
  };

  it("a client-router fetch of /de/about with an en cookie → the page is de, the cookie is left alone", () => {
    const response = createMiddleware(AS_NEEDED)(request("/de/about", "empty", "en"));

    expect(response.headers.get("x-comvi-locale")).toBe("de");
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });

  it("a client-router fetch with no cookie yet → no cookie is created", () => {
    const response = createMiddleware(AS_NEEDED)(request("/de/about", "empty"));

    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });

  it("a document load of /de/about with an en cookie → the cookie records de", () => {
    const response = createMiddleware(AS_NEEDED)(request("/de/about", "document", "en"));

    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de");
  });

  it("a request without Sec-Fetch-Dest (a non-browser client) → recorded, as a document load is", () => {
    const response = createMiddleware(AS_NEEDED)(request("/de/about", undefined, "en"));

    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de");
  });

  // The one fetch that still writes: a redirect away from a URL that names its
  // locale leads to a URL that names none, and the cookie is all that tells the
  // redirected request which locale that was.
  it("a client-router fetch of /en/about with a de cookie → redirected to /about, and the cookie carries en there", () => {
    const response = createMiddleware(AS_NEEDED)(request("/en/about", "empty", "de"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/about");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
  });

  it("a client-router fetch of /about with a de cookie → still redirected to /de/about, cookie untouched", () => {
    const response = createMiddleware(AS_NEEDED)(request("/about", "empty", "de"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/de/about");
    expect(response.cookies.get("NEXT_LOCALE")).toBeUndefined();
  });
});
