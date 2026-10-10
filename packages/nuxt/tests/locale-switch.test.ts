/**
 * An explicit locale switch, end to end through the pieces that have to agree:
 * what produces the URL (`useSwitchLocalePath()`, `<NuxtLinkLocale locale>`)
 * and the real route middleware, which resolves a URL that names no locale
 * from the locale cookie.
 *
 * Under `localePrefix: "as-needed"` the default locale's URL carries no prefix.
 * A switch to it used to be answered from the cookie, which still held the
 * locale being left: the root path redirected straight back, and any other
 * path served the default locale once but kept the old preference, so the next
 * visit to `/` went back too. The cookie is the record of the user's choice, so
 * a switch has to end with the cookie saying what the user chose.
 *
 * `#app` is the framework boundary and is stubbed; the middleware, the
 * composable and the component are the real ones.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp, h, type Component } from "vue";

vi.mock("../src/runtime/utils/runtime", () => ({
  isServer: vi.fn(() => false),
}));

import middleware from "../src/runtime/middleware/i18n.global";
import { useSwitchLocalePath } from "../src/runtime/composables/useSwitchLocalePath";
import NuxtLinkLocale from "../src/runtime/components/NuxtLinkLocale";
import {
  resetMocks,
  setMockCookie,
  setMockI18n,
  setMockRoute,
  setLocaleOptions,
  mockRuntimeConfig,
} from "./mocks/nuxt-app";
import { useCookie, useState } from "#app";

const route = (fullPath: string) => ({ params: {}, path: fullPath, fullPath });

/** The page the user is on: its route, the locale it rendered in, its cookie. */
const standOn = (fullPath: string, locale: string) => {
  setMockRoute({ path: fullPath, fullPath });
  const active = { value: locale };
  setMockI18n({
    locale: active,
    setLocale: async (next: string) => {
      active.value = next;
    },
  });
  setMockCookie("i18n_locale", locale);
};

const readDocumentCookies = (): Record<string, string> =>
  Object.fromEntries(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => pair.split("=") as [string, string]),
  );

/**
 * Click a `<NuxtLinkLocale>`. Nuxt's `useCookie()` reads `document.cookie`
 * afresh on every call, which is how the middleware sees what a click wrote;
 * the `#app` stub keeps its own store, so the document's value is copied over.
 */
const clickLink = (props: Record<string, unknown>) => {
  const host = document.createElement("div");
  const app = createApp({ render: () => h(NuxtLinkLocale as Component, props, () => "link") });
  app.mount(host);
  // `RouterLink`'s own click handler runs first and calls `preventDefault()` to
  // keep the browser from loading the page, so by the time a handler passed to
  // `<NuxtLink>` runs, the event is ALWAYS default-prevented.
  host.addEventListener("click", (event) => event.preventDefault(), true);
  host.querySelector("a")!.click();
  app.unmount();
  for (const [name, value] of Object.entries(readDocumentCookies())) {
    setMockCookie(name, value);
  }
  return host;
};

beforeEach(() => {
  resetMocks();
  mockRuntimeConfig.public.comvi.localePrefix = "as-needed";
});

afterEach(() => {
  for (const name of Object.keys(readDocumentCookies())) {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
});

describe("switchLocalePath(defaultLocale) under as-needed", () => {
  it("from /de to / → the default locale is served at /, no redirect back to /de", async () => {
    standOn("/de", "de");
    const target = useSwitchLocalePath()("en");

    const result = await middleware(route(target), route("/de"));

    expect(target).toBe("/");
    expect(result).toBeUndefined();
    expect(useState<string>("i18n-locale").value).toBe("en");
  });

  it("from /de to / → the cookie records en", async () => {
    standOn("/de", "de");

    await middleware(route(useSwitchLocalePath()("en")), route("/de"));

    expect(useCookie("i18n_locale").value).toBe("en");
  });

  it("from /de/about to /about → the cookie records en instead of keeping de", async () => {
    standOn("/de/about", "de");
    const target = useSwitchLocalePath()("en");

    const result = await middleware(route(target), route("/de/about"));

    expect(target).toBe("/about");
    expect(result).toBeUndefined();
    expect(useCookie("i18n_locale").value).toBe("en");
  });

  it("the choice survives: after the switch, a later visit to / stays on en", async () => {
    standOn("/de/about", "de");
    await middleware(route(useSwitchLocalePath()("en")), route("/de/about"));

    const later = await middleware(route("/"));

    expect(later).toBeUndefined();
  });
});

describe("a clicked <NuxtLinkLocale locale>", () => {
  it("locale='en' to another page from /de/about → the cookie records en and / serves en", async () => {
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en" });
    const result = await middleware(route("/"), route("/de/about"));

    expect(useCookie("i18n_locale").value).toBe("en");
    expect(result).toBeUndefined();
    expect(useState<string>("i18n-locale").value).toBe("en");
  });

  it("under never, locale='de' from an en page → the cookie records de and the page serves de", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    standOn("/", "en");

    clickLink({ to: "/about", locale: "de" });
    const result = await middleware(route("/about"), route("/"));

    expect(result).toBeUndefined();
    expect(useState<string>("i18n-locale").value).toBe("de");
  });

  it("writes the cookie the middleware reads: name and attributes from localeCookie", () => {
    setLocaleOptions({ localeCookie: { name: "LANG", maxAge: 60 } });
    standOn("/de/about", "de");
    const written = vi.spyOn(document, "cookie", "set");

    clickLink({ to: "/", locale: "en" });

    expect(written).toHaveBeenCalledWith("LANG=en; Path=/; Max-Age=60; SameSite=Lax");
  });

  it("without a locale prop → no cookie is written", () => {
    standOn("/de/about", "de");

    clickLink({ to: "/contact" });

    expect(readDocumentCookies()).toEqual({});
  });

  it("with localeCookie: false → no cookie is written", () => {
    setLocaleOptions({ localeCookie: false });
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en" });

    expect(readDocumentCookies()).toEqual({});
  });

  it("keeps the app's own click handler", () => {
    standOn("/de/about", "de");
    const onClick = vi.fn();

    clickLink({ to: "/", locale: "en", onClick });

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("navigations that are not a switch behave as before", () => {
  it("a link from /de/about to ANOTHER page's unprefixed URL → en is served, the de preference is kept", async () => {
    standOn("/de/about", "de");

    const result = await middleware(route("/contact"), route("/de/about"));

    expect(result).toBeUndefined();
    expect(useState<string>("i18n-locale").value).toBe("en");
    expect(useCookie("i18n_locale").value).toBe("de");
  });

  it("a link from /de/about to / → the cookie still redirects to /de", async () => {
    standOn("/de/about", "de");

    const result = await middleware(route("/"), route("/de/about"));

    expect(result).toEqual({ path: "/de", redirectCode: 302 });
  });

  it("a direct visit to / with a de cookie → still redirected to /de", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware(route("/"));

    expect(result).toEqual({ path: "/de", redirectCode: 302 });
  });

  it("the first client-side run on /, where the router's start location is also / → the cookie still redirects", async () => {
    setMockCookie("i18n_locale", "de");

    const result = await middleware(route("/"), route("/"));

    expect(result).toEqual({ path: "/de", redirectCode: 302 });
  });

  it("under always, /de/about to /about → redirected by the cookie, as any unprefixed URL is", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    standOn("/de/about", "de");

    const result = await middleware(route("/about"), route("/de/about"));

    expect(result).toEqual({ path: "/de/about", redirectCode: 302 });
  });
});
