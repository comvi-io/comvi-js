/**
 * A `<NuxtLinkLocale locale>` switch under `localePrefix: "never"`, through a REAL
 * `vue-router`: the click's locale lives in memory for the navigation it starts, and only the
 * router knows when that navigation ends (lands, is cancelled by a newer one, is a duplicate,
 * or a guard throws), whether a route record redirected it, and which path it finally has.
 * The router stub of `tests/mocks/nuxt-app.ts` runs no guards and reports no failures, so
 * none of these cases can be seen there. The middleware, the component and the target are
 * the real ones; `#app` is stubbed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, h, type Component } from "vue";
import {
  createMemoryHistory,
  createRouter,
  type NavigationGuardWithThis,
  type RouteRecordRaw,
} from "vue-router";
import middleware from "../src/runtime/middleware/i18n.global";
import NuxtLinkLocale from "../src/runtime/components/NuxtLinkLocale";
import {
  getMockCookieWrites,
  mockRuntimeConfig,
  resetMocks,
  setLocaleOptions,
  setMockCookie,
  setMockI18n,
  setMockRoute,
  setRouterOverride,
} from "./mocks/nuxt-app";
import { useCookie, useNuxtApp } from "#app";

const Stub = { render: () => h("div") };
const ROUTES: RouteRecordRaw[] = [
  { path: "/", component: Stub },
  { path: "/home", component: Stub },
  { path: "/admin", component: Stub },
  { path: "/old", redirect: "/admin" },
  { path: "/about", component: Stub },
  { path: "/uk/about", component: Stub },
  ...["en", "uk"].flatMap((l) =>
    ["home", "admin", "plurals"].map((page) => ({ path: `/${l}/${page}`, component: Stub })),
  ),
];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An instance whose switches take `ms[locale]` to load; the last `setLocale()` wins. */
function slowInstance(locale: string, ms: Record<string, number> = {}) {
  let token = 0;
  const instance = {
    locale,
    async setLocale(next: string) {
      const mine = ++token;
      if (next !== instance.locale) await sleep(ms[next] ?? 0);
      if (mine === token) instance.locale = next;
    },
  };
  return instance;
}

/** A real router at `path`, the i18n middleware as its global guard (after `before`, if any). */
async function standOn(
  path: string,
  { before, ms }: { before?: NavigationGuardWithThis<undefined>; ms?: Record<string, number> } = {},
) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push(path);
  const i18n = slowInstance("en", ms);
  setMockI18n(i18n);
  setMockCookie("i18n_locale", "en");
  if (before) router.beforeEach(before);
  router.beforeEach((to, from) => middleware(to, from) as never);
  router.afterEach((to) => setMockRoute({ path: to.path, fullPath: to.fullPath }));
  setRouterOverride(router);
  setMockRoute({ path, fullPath: path });
  return { router, i18n };
}

/** A click on `<NuxtLinkLocale :to :locale>`, then the navigation its `RouterLink` starts. */
function click(router: { push(to: string): Promise<unknown> }, to: string, locale?: string) {
  if (locale) {
    const host = document.createElement("div");
    const app = createApp({ render: () => h(NuxtLinkLocale as Component, { to, locale }) });
    app.mount(host);
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.unmount();
  }
  return router.push(to).catch(() => {});
}

const cookie = () => useCookie("i18n_locale").value;
const target = () => (useNuxtApp() as { _comviTarget?: unknown })._comviTarget;

beforeEach(() => {
  resetMocks();
  mockRuntimeConfig.public.comvi.locales = ["en", "uk", "de"];
  mockRuntimeConfig.public.comvi.localePrefix = "never";
});

describe("<NuxtLinkLocale locale> under `never`, against a real vue-router", () => {
  it("switches through a link to another path, and the cookie records it after landing", async () => {
    const { router, i18n } = await standOn("/home");
    await click(router, "/admin", "uk");

    expect([router.currentRoute.value.path, i18n.locale, cookie(), target()]).toEqual([
      "/admin",
      "uk",
      "uk",
      undefined,
    ]);
  });

  it("switches through a link to the URL already on screen (a duplicate: the router runs no guard)", async () => {
    const { router, i18n } = await standOn("/admin");
    await click(router, "/admin", "uk");
    await sleep(0);

    expect([i18n.locale, target()]).toEqual(["uk", undefined]);
  });

  it("a link the router finds a duplicate of the page on screen, though not string-identical (a redirect record to it), switches", async () => {
    const { router, i18n } = await standOn("/admin");
    await click(router, "/old", "uk");
    await sleep(0);

    expect([router.currentRoute.value.path, i18n.locale, target()]).toEqual([
      "/admin",
      "uk",
      undefined,
    ]);
  });

  it("two quick locale clicks to the same path: the last one wins, whatever ends first", async () => {
    let n = 0;
    const { router, i18n } = await standOn("/home", {
      before: async () => void (++n === 2 && (await sleep(60))),
      ms: { uk: 20, de: 20 },
    });
    const first = click(router, "/admin", "uk");
    await sleep(5);
    const second = click(router, "/admin", "de");
    await Promise.all([first, second]);
    await sleep(50);

    expect([i18n.locale, cookie()]).toEqual(["de", "de"]);
  });

  it("a guard that throws before the i18n middleware ends the click; a later ordinary link does not take it", async () => {
    let boom = true;
    const { router, i18n } = await standOn("/home", {
      before: () => {
        if (boom) {
          boom = false;
          throw new Error("boom");
        }
      },
    });
    await click(router, "/admin", "uk");
    expect(target()).toBeUndefined();
    await click(router, "/admin");

    expect([router.currentRoute.value.path, i18n.locale, cookie()]).toEqual(["/admin", "en", "en"]);
  });

  it("an ordinary link to the page on screen while a locale link is pending does not take that link's locale", async () => {
    const { router, i18n } = await standOn("/home", { before: async () => void (await sleep(20)) });
    const pending = click(router, "/admin", "uk");
    await sleep(5);
    await click(router, "/home");
    // The duplicate is reported while the locale link still waits in the guard ahead.
    await sleep(1);
    expect(i18n.locale).toBe("en");
    await pending;
    await sleep(30);

    expect([router.currentRoute.value.path, i18n.locale, cookie(), target()]).toEqual([
      "/home",
      "en",
      "en",
      undefined,
    ]);
  });

  it("a locale click that starts no navigation (prevented) is not taken by a later duplicate navigation", async () => {
    const { router, i18n } = await standOn("/home");
    const host = document.createElement("div");
    const app = createApp({
      render: () => h(NuxtLinkLocale as Component, { to: "/admin", locale: "uk" }),
    });
    app.mount(host);
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.unmount();
    await router.push("/home").catch(() => {});
    await sleep(0);

    expect([router.currentRoute.value.path, i18n.locale, target()]).toEqual([
      "/home",
      "en",
      undefined,
    ]);
  });

  it("a link to a route record that redirects still switches", async () => {
    const { router, i18n } = await standOn("/home");
    await click(router, "/old", "uk");

    expect([router.currentRoute.value.path, i18n.locale, cookie()]).toEqual(["/admin", "uk", "uk"]);
  });

  it("a link NuxtLink navigates with a trailing slash (`trailingSlash: 'append'`) still switches", async () => {
    const { router, i18n } = await standOn("/home");
    // The component writes `/admin`; NuxtLink's `trailingSlash` makes it `/admin/`.
    const host = document.createElement("div");
    const app = createApp({
      render: () => h(NuxtLinkLocale as Component, { to: "/admin", locale: "uk" }),
    });
    app.mount(host);
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.unmount();
    await router.push("/admin/");

    expect([i18n.locale, cookie()]).toEqual(["uk", "uk"]);
  });

  it("with `localeCookie: false` a click records nothing: neither a link to another URL nor one to the page on screen switches", async () => {
    setLocaleOptions({ localeCookie: false });
    const { router, i18n } = await standOn("/home");
    await click(router, "/admin", "uk");
    expect(i18n.locale).toBe("en");
    await click(router, "/admin", "uk");
    await sleep(0);

    expect(i18n.locale).toBe("en");
  });

  it("as-needed: a switch whose catalogs fail redirects back, and the redirected run does not take the click again (cookie stays)", async () => {
    mockRuntimeConfig.public.comvi.localePrefix = "as-needed";
    const { router, i18n } = await standOn("/");
    i18n.setLocale = async (next: string) => {
      if (next === "uk") throw new Error("load_failed");
      i18n.locale = next;
    };
    await click(router, "/uk/about", "uk");

    expect([router.currentRoute.value.path, i18n.locale, cookie(), target()]).toEqual([
      "/about",
      "en",
      "en",
      undefined,
    ]);
    expect(getMockCookieWrites("i18n_locale")).toEqual(["en"]);
  });
});

describe("a link to the URL on screen while a switch loads (`always`), against a real vue-router", () => {
  beforeEach(() => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
  });

  it("an ordinary link to the page on screen supersedes the pending switch: URL, locale and cookie stay together", async () => {
    const { router, i18n } = await standOn("/en/home", { ms: { uk: 20 } });
    const pending = click(router, "/uk/home");
    await sleep(5);
    await click(router, "/en/home");
    await pending;
    await sleep(30);

    expect([router.currentRoute.value.path, i18n.locale, cookie()]).toEqual([
      "/en/home",
      "en",
      "en",
    ]);
  });

  it("a link to the page on screen while a switch to another page loads: the user stays on the page on screen", async () => {
    const { router, i18n } = await standOn("/en/plurals", { ms: { uk: 20 } });
    const pending = click(router, "/uk/admin");
    await sleep(5);
    await click(router, "/en/plurals");
    await pending;
    await sleep(30);

    expect([router.currentRoute.value.path, i18n.locale, cookie()]).toEqual([
      "/en/plurals",
      "en",
      "en",
    ]);
  });

  it("a <NuxtLinkLocale locale> to the page on screen still switches for its own navigation", async () => {
    const { router, i18n } = await standOn("/en/home");
    const host = document.createElement("div");
    const app = createApp({
      render: () => h(NuxtLinkLocale as Component, { to: "/home", locale: "uk" }),
    });
    app.mount(host);
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.unmount();
    await router.push("/uk/home").catch(() => {});
    await sleep(0);

    expect([router.currentRoute.value.path, i18n.locale]).toEqual(["/uk/home", "uk"]);
  });
});
