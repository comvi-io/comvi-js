/**
 * An explicit locale switch, end to end through the two halves that have to
 * agree: the navigation hooks (which choose the URL) and the real middleware
 * (which resolves a URL that names no locale from the locale cookie).
 *
 * Under `localePrefix: "as-needed"` the default locale's URL carries no prefix,
 * and under `"never"` no URL does. A switch to such a URL used to be answered
 * from the cookie, which still held the locale being left, and redirected
 * straight back. A switch now (1) navigates to the locale-prefixed URL, which
 * the middleware reads as an explicit choice and redirects to the public one,
 * and (2) writes the cookie in the browser, because Next answers a cached
 * navigation without a request, so the middleware never sees it.
 *
 * `next/navigation` and `next/link` are the framework boundary and are stubbed;
 * `createMiddleware` is the real one, fed the URL the hooks produced and the
 * cookies the document holds at that moment, redirects followed as a browser
 * follows them.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, act, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

import { I18nProvider } from "../src/client/I18nProvider";
import { Link, useLocalizedRouter } from "../src/navigation";
import { createMiddleware } from "../src/middleware/createMiddleware";
import { createNextI18n } from "../src/createNextI18n";
import { createNextI18nFromInstance } from "../src/server";
import { _resetServerI18n } from "../src/server/cache";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { defineRouting } from "../src/routing/defineRouting";
import type { RoutingConfig } from "../src/routing/types";

const nextNavigation = vi.hoisted(() => ({
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
  usePathname: () => "/",
  useRouter: () => nextNavigation.router,
}));

vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: react.forwardRef(function NextLinkStub(
      {
        href,
        prefetch,
        children,
        ...rest
      }: { href: unknown; prefetch?: boolean | null; children?: React.ReactNode },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return react.createElement(
        "a",
        {
          "data-testid": "next-link",
          "data-href": JSON.stringify(href),
          "data-prefetch": String(prefetch),
          ...rest,
          ref,
        },
        children,
      );
    }),
  };
});

const AS_NEEDED: RoutingConfig = {
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
};

const readCookies = (): Record<string, string> =>
  Object.fromEntries(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => pair.split("=") as [string, string]),
  );

const expireCookie = (name: string) => {
  document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

/**
 * What a browser ends up with after navigating to `href`: the document's
 * cookies ride along, a `Set-Cookie` is stored, and a redirect is followed.
 */
const navigate = (
  routing: RoutingConfig,
  href: string,
): { pathname: string; locale: string | null } => {
  const middleware = createMiddleware(routing);
  let url = new URL(href, "http://localhost:3000");
  for (let hop = 0; hop < 5; hop++) {
    const request = new NextRequest(url);
    // `cookie` is a forbidden header under happy-dom, so the cookies go through
    // `NextRequest.cookies.set()` — same note as `middleware.test.ts`.
    for (const [name, value] of Object.entries(readCookies())) {
      request.cookies.set(name, value);
    }
    const response = middleware(request);
    for (const cookie of response.cookies.getAll()) {
      document.cookie = `${cookie.name}=${cookie.value}; Path=/`;
    }
    const location = response.headers.get("location");
    if (!location) {
      return { pathname: url.pathname, locale: response.headers.get("x-comvi-locale") };
    }
    url = new URL(location);
  }
  throw new Error(`redirect loop from ${href}`);
};

const renderRouter = (routing: RoutingConfig, locale: string) => {
  const fake = new FakeI18n({ language: locale });
  return renderHook(() => useLocalizedRouter(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <I18nProvider i18n={fake.asI18n()} locale={locale} routing={routing} autoInit={false}>
        {children}
      </I18nProvider>
    ),
  });
};

const renderLink = (link: React.ReactNode, routing: RoutingConfig, locale: string) => {
  const fake = new FakeI18n({ language: locale });
  return render(
    <I18nProvider i18n={fake.asI18n()} locale={locale} routing={routing} autoInit={false}>
      {link}
    </I18nProvider>,
  );
};

beforeEach(() => {
  for (const method of Object.values(nextNavigation.router)) {
    method.mockClear();
  }
});

afterEach(() => {
  for (const name of Object.keys(readCookies())) {
    expireCookie(name);
  }
});

describe("explicit switch to the default locale under as-needed", () => {
  it.each(["push", "replace"] as const)(
    "router.%s(href, defaultLocale) from de with a de cookie → lands on en at the unprefixed URL",
    (method) => {
      document.cookie = "NEXT_LOCALE=de; Path=/";
      const { result } = renderRouter(AS_NEEDED, "de");

      act(() => {
        result.current[method]("/about", "en");
      });
      const href = nextNavigation.router[method].mock.calls[0]![0] as string;
      const landed = navigate(AS_NEEDED, href);

      expect(landed).toEqual({ pathname: "/about", locale: "en" });
    },
  );

  it("a clicked <Link locale={defaultLocale}> from de with a de cookie → lands on en at the unprefixed URL", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    renderLink(
      <Link href="/about" locale="en">
        English
      </Link>,
      AS_NEEDED,
      "de",
    );

    fireEvent.click(screen.getByTestId("next-link"));
    const href = JSON.parse(screen.getByTestId("next-link").dataset.href!) as string;
    const landed = navigate(AS_NEEDED, href);

    expect(landed).toEqual({ pathname: "/about", locale: "en" });
  });

  it("the root path: router.push('/', defaultLocale) from de with a de cookie → lands on en at /", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    const { result } = renderRouter(AS_NEEDED, "de");

    act(() => {
      result.current.push("/", "en");
    });
    const href = nextNavigation.router.push.mock.calls[0]![0] as string;
    const landed = navigate(AS_NEEDED, href);

    expect(landed).toEqual({ pathname: "/", locale: "en" });
  });

  it("the choice survives: after the switch, a later visit to / stays on en", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    const { result } = renderRouter(AS_NEEDED, "de");
    act(() => {
      result.current.push("/about", "en");
    });
    navigate(AS_NEEDED, nextNavigation.router.push.mock.calls[0]![0] as string);

    const later = navigate(AS_NEEDED, "/");

    expect(later).toEqual({ pathname: "/", locale: "en" });
  });
});

describe("the URL a switch navigates to", () => {
  it("router.push(href, anotherLocale) under as-needed → the locale-prefixed URL, default locale included", () => {
    const { result } = renderRouter(AS_NEEDED, "de");

    act(() => {
      result.current.push("/about", "en");
    });

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/en/about");
  });

  it("router.push(href, currentLocale) → the public URL, because nothing is being switched", () => {
    const { result } = renderRouter(AS_NEEDED, "en");

    act(() => {
      result.current.push("/about", "en");
    });

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/about");
  });

  it("<Link locale={currentLocale}> → the public URL", () => {
    renderLink(
      <Link href="/about" locale="en">
        English
      </Link>,
      AS_NEEDED,
      "en",
    );

    expect(JSON.parse(screen.getByTestId("next-link").dataset.href!)).toBe("/about");
  });

  it("<Link locale={anotherLocale}> with a URL object → its pathname is locale-prefixed, its query kept", () => {
    renderLink(
      <Link href={{ pathname: "/about", query: { tab: "team" } }} locale="en">
        English
      </Link>,
      AS_NEEDED,
      "de",
    );

    expect(JSON.parse(screen.getByTestId("next-link").dataset.href!)).toEqual({
      pathname: "/en/about",
      query: { tab: "team" },
    });
  });
});

describe("the switch records the choice in the cookie before any request", () => {
  // Next answers a navigation it has cached without a request: the middleware
  // never runs, so its own cookie write cannot be what records the choice.
  it("router.push(href, 'en') with a de cookie → the cookie already says en", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    const { result } = renderRouter(AS_NEEDED, "de");

    act(() => {
      result.current.push("/about", "en");
    });

    expect(readCookies()).toEqual({ NEXT_LOCALE: "en" });
  });

  it("a clicked <Link locale='en'> with a de cookie → the cookie already says en", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    renderLink(
      <Link href="/about" locale="en">
        English
      </Link>,
      AS_NEEDED,
      "de",
    );

    fireEvent.click(screen.getByTestId("next-link"));

    expect(readCookies()).toEqual({ NEXT_LOCALE: "en" });
  });
});

describe("explicit switch under never, where no URL names a locale", () => {
  const NEVER: RoutingConfig = { ...AS_NEEDED, localePrefix: "never" };

  it("router.push(href, 'de') from en with an en cookie → lands on de at the unprefixed URL", () => {
    document.cookie = "NEXT_LOCALE=en; Path=/";
    const { result } = renderRouter(NEVER, "en");

    act(() => {
      result.current.push("/about", "de");
    });
    const href = nextNavigation.router.push.mock.calls[0]![0] as string;
    const landed = navigate(NEVER, href);

    expect(landed).toEqual({ pathname: "/about", locale: "de" });
  });
});

describe("visits that are not a switch behave as before", () => {
  it("a first visit to / with no cookie and a German browser → detection sends it to /de", () => {
    const request = new NextRequest("http://localhost:3000/", {
      headers: { "accept-language": "de-DE,de;q=0.9" },
    });

    const response = createMiddleware(AS_NEEDED)(request);

    expect(response.headers.get("location")).toBe("http://localhost:3000/de");
  });

  it("a direct visit to an unprefixed URL with a de cookie → still redirected to the cookie's locale", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";

    const landed = navigate(AS_NEEDED, "/about");

    expect(landed).toEqual({ pathname: "/de/about", locale: "de" });
  });
});

describe("what names no locale leaves the cookie alone", () => {
  it("router.push(href) without a locale → the stored preference is untouched", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    const { result } = renderRouter(AS_NEEDED, "en");

    act(() => {
      result.current.push("/about");
    });

    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });

  it("router.prefetch(href, locale) → the stored preference is untouched", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    const { result } = renderRouter(AS_NEEDED, "de");

    act(() => {
      result.current.prefetch("/about", "en");
    });

    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });

  it("a clicked <Link> without a locale → the stored preference is untouched", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    renderLink(<Link href="/about">About</Link>, AS_NEEDED, "en");

    fireEvent.click(screen.getByTestId("next-link"));

    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });

  it("a <Link locale> whose own onClick prevents the navigation → the stored preference is untouched", () => {
    document.cookie = "NEXT_LOCALE=de; Path=/";
    renderLink(
      <Link href="/about" locale="en" onClick={(event) => event.preventDefault()}>
        English
      </Link>,
      AS_NEEDED,
      "de",
    );

    fireEvent.click(screen.getByTestId("next-link"));

    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });

  it("a locale outside routing.locales → nothing is written", () => {
    const { result } = renderRouter(AS_NEEDED, "de");

    act(() => {
      result.current.push("/about", "xx");
    });

    expect(readCookies()).toEqual({});
  });
});

describe("the cookie the switch writes is the one the middleware reads", () => {
  it("localeCookie: a custom name → that cookie is written, NEXT_LOCALE is not", () => {
    const routing: RoutingConfig = { ...AS_NEEDED, localeCookie: "MY_LOCALE" };
    const { result } = renderRouter(routing, "de");

    act(() => {
      result.current.push("/about", "en");
    });

    expect(readCookies()).toEqual({ MY_LOCALE: "en" });
  });

  it("localeCookie: false → the switch writes no cookie at all", () => {
    const routing: RoutingConfig = { ...AS_NEEDED, localeCookie: false };
    const { result } = renderRouter(routing, "de");

    act(() => {
      result.current.push("/about", "en");
    });

    expect(readCookies()).toEqual({});
  });
});

describe("<Link> to another locale is not prefetched", () => {
  // A prefetch is a real request through the middleware: it would overwrite the
  // cookie with the link's locale, and cache the redirect the OLD cookie caused
  // for the very URL the click then navigates to.
  it("<Link locale> naming another locale → prefetch is off", () => {
    renderLink(
      <Link href="/about" locale="en">
        English
      </Link>,
      AS_NEEDED,
      "de",
    );

    expect(screen.getByTestId("next-link").dataset.prefetch).toBe("false");
  });

  it("<Link locale> naming the current locale → prefetch is left to Next", () => {
    renderLink(
      <Link href="/about" locale="de">
        Deutsch
      </Link>,
      AS_NEEDED,
      "de",
    );

    expect(screen.getByTestId("next-link").dataset.prefetch).toBe("undefined");
  });
});

describe("a switch through the hooks without a routing config", () => {
  // The manual setup: `<I18nProvider>` with no `routing` prop. The middleware
  // no longer records the client-router fetch a switch makes, so the switch
  // records itself, in the cookie the middleware reads by default.
  const renderBareRouter = (locale: string) => {
    const fake = new FakeI18n({ language: locale });
    return renderHook(() => useLocalizedRouter(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <I18nProvider i18n={fake.asI18n()} locale={locale} autoInit={false}>
          {children}
        </I18nProvider>
      ),
    });
  };

  it("router.push(href, 'de') → NEXT_LOCALE records de", () => {
    document.cookie = "NEXT_LOCALE=en; Path=/";
    const { result } = renderBareRouter("en");

    act(() => {
      result.current.push("/about", "de");
    });

    expect(nextNavigation.router.push).toHaveBeenCalledWith("/de/about");
    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });

  it("a clicked <Link locale='de'> → NEXT_LOCALE records de", () => {
    document.cookie = "NEXT_LOCALE=en; Path=/";
    const fake = new FakeI18n({ language: "en" });
    render(
      <I18nProvider i18n={fake.asI18n()} locale="en" autoInit={false}>
        <Link href="/about" locale="de">
          Deutsch
        </Link>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("next-link"));

    expect(readCookies()).toEqual({ NEXT_LOCALE: "de" });
  });
});

describe("the routing object the factories return carries the cookie the middleware writes", () => {
  // The standard setup: `defineRouting` in `routing.ts`, spread into the
  // factory, whose `routing` reaches `<I18nProvider>` through `<ComviProvider>`.
  // The switch must write the cookie the middleware reads. Both factories
  // used to rebuild `routing` from four keys and drop `localeCookie`.
  const factories = {
    createNextI18n: (options: RoutingConfig) => createNextI18n({ ...options }).routing,
    createNextI18nFromInstance: (options: RoutingConfig) =>
      createNextI18nFromInstance(
        () => attachLoader(createI18n({ locale: "en", exposeGlobal: false, devMode: false })),
        { ...options },
      ).routing,
  };

  const switchThrough = (
    factory: keyof typeof factories,
    localeCookie: RoutingConfig["localeCookie"],
  ) => {
    _resetServerI18n();
    const routing = factories[factory](
      defineRouting({ locales: ["en", "de"], defaultLocale: "en", localeCookie }),
    );
    const { result } = renderRouter(routing, "de");
    act(() => {
      result.current.push("/about", "en");
    });
  };

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    "%s with localeCookie: 'MY_LOCALE' → the switch writes MY_LOCALE, not NEXT_LOCALE",
    (factory) => {
      switchThrough(factory, "MY_LOCALE");

      expect(readCookies()).toEqual({ MY_LOCALE: "en" });
    },
  );

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    "%s with localeCookie: false → the switch writes no cookie",
    (factory) => {
      switchThrough(factory, false);

      expect(readCookies()).toEqual({});
    },
  );

  it.each(Object.keys(factories) as Array<keyof typeof factories>)(
    "%s with cookie attributes → returned as configured",
    (factory) => {
      _resetServerI18n();
      const localeCookie = { name: "LANG", maxAge: 60, sameSite: "strict" as const };

      const routing = factories[factory](
        defineRouting({ locales: ["en", "de"], defaultLocale: "en", localeCookie }),
      );

      expect(routing.localeCookie).toEqual({ name: "LANG", maxAge: 60, sameSite: "strict" });
    },
  );
});
