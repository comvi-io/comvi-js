/**
 * `@comvi/next/navigation` hooks against a stubbed Next router.
 *
 * `next/navigation` is the framework boundary: there is no App Router in a
 * vitest process, so it is stubbed and the assertions are about what the hooks
 * hand it and what they derive from the URL it reports.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { payloadFor } from "./helpers/payload";

import { I18nProvider } from "../src/client/I18nProvider";
import { usePathname, useLocalizedRouter } from "../src/navigation";
import type { RoutingConfig } from "../src/routing/types";

const nextNavigation = vi.hoisted(() => ({
  pathname: null as string | null,
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nextNavigation.pathname,
  useRouter: () => nextNavigation.router,
}));

// `restoreMocks` restores spies, not the standalone `vi.fn()`s in the stub, so
// the router is cleared explicitly: without this a call recorded by an earlier
// test satisfies a later `toHaveBeenCalledWith`.
beforeEach(() => {
  nextNavigation.pathname = null;
  for (const method of Object.values(nextNavigation.router)) {
    method.mockClear();
  }
});

const ROUTING: RoutingConfig = {
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  pathnames: {
    "/about": { de: "/ueber-uns" },
  },
};

interface HarnessOptions {
  pathname?: string | null;
  routing?: RoutingConfig;
  locale?: string;
}

/** The locale of the payload the harness renders with; a rerender after a change hands it over. */
const current = { locale: "de" };

const renderUnderProvider = <T,>(hook: () => T, options: HarnessOptions = {}) => {
  const { pathname = "/", routing } = options;
  nextNavigation.pathname = pathname;
  current.locale = options.locale ?? "de";
  const rendered = renderHook(hook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <I18nProvider payload={payloadFor(current.locale)} routing={routing}>
        {children}
      </I18nProvider>
    ),
  });

  return rendered;
};

describe("usePathname", () => {
  it("maps a localized slug back to its canonical route", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/de/ueber-uns",
      routing: ROUTING,
      locale: "de",
    });

    expect(result.current).toBe("/about");
  });

  it("leaves a route the routing config does not rename unprefixed", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/de/contact",
      routing: ROUTING,
      locale: "de",
    });

    expect(result.current).toBe("/contact");
  });

  it("reports the root path when Next has no pathname yet", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: null,
      locale: "de",
    });

    expect(result.current).toBe("/");
  });

  it("strips the current locale prefix when no routing config is provided", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/en/about",
      locale: "en",
    });

    expect(result.current).toBe("/about");
  });

  it("reports the root path for a bare locale prefix when no routing config is provided", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/de",
      locale: "de",
    });

    expect(result.current).toBe("/");
  });

  it("leaves an unprefixed pathname untouched when no routing config is provided", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/about",
      locale: "de",
    });

    expect(result.current).toBe("/about");
  });

  it("does not treat a locale that merely begins a segment as a prefix", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/ensemble",
      locale: "en",
    });

    expect(result.current).toBe("/ensemble");
  });

  // A trailing slash used to bypass the pathnames map entirely, so this
  // returned the PUBLIC slug (`/ueber-uns/`) instead of the canonical route.
  it("maps a trailing-slash localized slug back to its canonical route, slash kept", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/de/ueber-uns/",
      routing: ROUTING,
      locale: "de",
    });

    expect(result.current).toBe("/about/");
  });

  it("maps a slug reached through a duplicated slash back to its canonical route", () => {
    const { result } = renderUnderProvider(() => usePathname(), {
      pathname: "/de//ueber-uns",
      routing: ROUTING,
      locale: "de",
    });

    expect(result.current).toBe("/about");
  });
});

describe("useLocalizedRouter", () => {
  it("localizes push targets with the current locale", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    result.current.push("/about");

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/de/ueber-uns");
  });

  it("localizes push targets with an explicitly requested locale", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    result.current.push("/about", "en");

    // Another locale than the page's is a switch: the locale-prefixed URL,
    // which the middleware redirects to `/about`. See `localeSwitch.ts`.
    expect(nextNavigation.router.push).toHaveBeenCalledWith("/en/about");
  });

  it("localizes replace targets", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    result.current.replace("/about", "en");

    expect(nextNavigation.router.replace).toHaveBeenCalledWith("/en/about");
  });

  it("localizes prefetch targets", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    result.current.prefetch("/about", "en");

    expect(nextNavigation.router.prefetch).toHaveBeenCalledWith("/about");
  });

  it("prefixes the bare locale segment when no routing config is provided", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), { locale: "de" });

    result.current.push("/about");
    result.current.replace("/about");
    result.current.prefetch("/about");

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/de/about");
    expect(nextNavigation.router.replace).toHaveBeenCalledWith("/de/about");
    expect(nextNavigation.router.prefetch).toHaveBeenCalledWith("/de/about");
  });

  it("passes the history controls through to the Next router untouched", () => {
    const { result } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    result.current.back();
    result.current.forward();
    result.current.refresh();

    expect(nextNavigation.router.back).toHaveBeenCalledOnce();
    expect(nextNavigation.router.forward).toHaveBeenCalledOnce();
    expect(nextNavigation.router.refresh).toHaveBeenCalledOnce();
  });

  it("follows a payload of another locale instead of the locale captured at mount", async () => {
    const { result, rerender } = renderUnderProvider(() => useLocalizedRouter(), {
      routing: ROUTING,
      locale: "de",
    });

    current.locale = "en";
    await act(async () => rerender());
    result.current.push("/about");
    result.current.replace("/about");
    result.current.prefetch("/about");

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/about");
    expect(nextNavigation.router.replace).toHaveBeenCalledWith("/about");
    expect(nextNavigation.router.prefetch).toHaveBeenCalledWith("/about");
  });
});
