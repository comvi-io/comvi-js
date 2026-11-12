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
  fakeInstance,
  getMockCookieOptions,
  getMockCookieWrites,
  endNavigation,
} from "./mocks/nuxt-app";
import { useCookie, useNuxtApp } from "#app";

const route = (fullPath: string) => ({ params: {}, path: fullPath, fullPath });

/** The page the user is on: its route, the locale it rendered in, its cookie. */
const standOn = (fullPath: string, locale: string) => {
  setMockRoute({ path: fullPath, fullPath });
  setMockI18n(fakeInstance(locale));
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
const clickLink = (props: Record<string, unknown>, init: MouseEventInit = {}) => {
  const host = document.createElement("div");
  const app = createApp({ render: () => h(NuxtLinkLocale as Component, props, () => "link") });
  app.mount(host);
  // `RouterLink`'s own click handler runs first and calls `preventDefault()` to
  // keep the browser from loading the page, so by the time a handler passed to
  // `<NuxtLink>` runs, the event is ALWAYS default-prevented.
  host.addEventListener("click", (event) => event.preventDefault(), true);
  host
    .querySelector("a")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  app.unmount();
  for (const [name, value] of Object.entries(readDocumentCookies())) {
    setMockCookie(name, value);
  }
  return host;
};

beforeEach(() => {
  resetMocks();
  setMockI18n(fakeInstance("en"));
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
    expect((useNuxtApp().$i18n as { locale: string }).locale).toBe("en");
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
    expect((useNuxtApp().$i18n as { locale: string }).locale).toBe("en");
  });

  it("under never, locale='de' from an en page → the cookie records de and the page serves de", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    standOn("/", "en");

    clickLink({ to: "/about", locale: "de" });
    const result = await middleware(route("/about"), route("/"));

    expect(result).toBeUndefined();
    expect((useNuxtApp().$i18n as { locale: string }).locale).toBe("de");
  });

  it("the click writes no cookie; the middleware records it once the switch has landed, with localeCookie's attributes", async () => {
    setLocaleOptions({ localeCookie: { name: "LANG", maxAge: 60 } });
    standOn("/de/about", "de");
    setMockCookie("LANG", "de");

    clickLink({ to: "/", locale: "en" });
    expect(getMockCookieWrites("LANG")).toEqual(["de"]);
    await middleware(route("/"), route("/de/about"));

    expect(getMockCookieWrites("LANG")).toEqual(["de", "en"]);
    expect(getMockCookieOptions("LANG")).toMatchObject({ maxAge: 60, path: "/", sameSite: "lax" });
  });

  it("a navigation aborted before the i18n middleware records nothing, and the next one resolves from the cookie", async () => {
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en" });
    endNavigation(); // another guard aborted it
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);

    expect(await middleware(route("/"), route("/de/about"))).toEqual({
      path: "/de",
      redirectCode: 302,
    });
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it("under never, a newer ordinary navigation does not take the cancelled click's locale", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "never";
    standOn("/", "en");

    clickLink({ to: "/about", locale: "de" });
    await middleware(route("/contact"), route("/"));

    expect((useNuxtApp().$i18n as { locale: string }).locale).toBe("en");
    expect(getMockCookieWrites("i18n_locale")).toEqual(["en"]);
  });

  it("without a locale prop → no cookie is written", () => {
    standOn("/de/about", "de");

    clickLink({ to: "/contact" });

    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it("with localeCookie: false → no cookie is written", () => {
    setLocaleOptions({ localeCookie: false });
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en" });

    expect(readDocumentCookies()).toEqual({});
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("a %s click opens another tab: this tab records nothing", async (_name, init) => {
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en" }, init);

    // The root of this tab still resolves from the cookie.
    expect(await middleware(route("/"), route("/de/about"))).toEqual({
      path: "/de",
      redirectCode: 302,
    });
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
  });

  it.each(["_blank", "preview"])(
    "a link with target=%s opens elsewhere: this tab records nothing",
    async (target) => {
      standOn("/de/about", "de");

      clickLink({ to: "/", locale: "en", target });

      expect(await middleware(route("/"), route("/de/about"))).toEqual({
        path: "/de",
        redirectCode: 302,
      });
      expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
    },
  );

  it.each([
    ["target=_parent", { target: "_parent" }],
    ["target=_top", { target: "_top" }],
    ["external", { external: true }],
    ["a bare external attribute", { external: "" }],
    ["target=_SELF (NuxtLink compares exactly)", { target: "_SELF" }],
  ])(
    "a link with %s is a page load (NuxtLink renders a plain anchor): nothing recorded in this document",
    async (_name, attrs) => {
      standOn("/de/about", "de");

      clickLink({ to: "/", locale: "en", ...attrs });

      expect(await middleware(route("/"), route("/de/about"))).toEqual({
        path: "/de",
        redirectCode: 302,
      });
      expect(getMockCookieWrites("i18n_locale")).toEqual(["de"]);
    },
  );

  it("a link with target=_self is this window: the choice applies and is recorded", async () => {
    standOn("/de/about", "de");

    clickLink({ to: "/", locale: "en", target: "_self" });

    expect(await middleware(route("/"), route("/de/about"))).toBeUndefined();
    expect(getMockCookieWrites("i18n_locale")).toEqual(["de", "en"]);
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
    expect((useNuxtApp().$i18n as { locale: string }).locale).toBe("en");
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
