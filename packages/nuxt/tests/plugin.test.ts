import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import type { Loader } from "@comvi/core";
import type { VueI18n } from "@comvi/vue";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import {
  getMockCookieWrites,
  resetMocks,
  setMockCookie,
  setMockRequestHeaders,
} from "./mocks/nuxt-app";
import { setComviOptions } from "./mocks/comvi-options";

vi.unmock("../src/runtime/utils/locale");

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { hello: "Hello" },
  "uk:default": { hello: "Привіт" },
  "en:admin": { title: "Admin" },
};

beforeEach(() => {
  resetMocks();
  nuxtAppMocks.mockRuntimeConfig.public.comvi.locales = ["en", "uk"];
  vi.spyOn(nuxtAppMocks, "useHead").mockImplementation((input: unknown) => input as never);
});

/** Runs the plugin on a mock Nuxt app; the instance, the hooks it registered and the app. */
async function run({
  payload = {},
  event,
  url,
  loader,
  data = {},
}: {
  payload?: Record<string, unknown>;
  event?: object;
  url?: string;
  loader?: Loader;
  data?: Record<string, unknown>;
} = {}) {
  const calls: string[] = [];
  const counted: Loader = async (locale, ns, signal) => {
    calls.push(`${locale}:${ns}`);
    if (loader) return loader(locale, ns, signal);
    const catalog = CATALOGS[`${locale}:${ns}`];
    if (!catalog) throw new Error(`${locale}:${ns}`);
    return catalog;
  };
  const factory = vi.fn(() => ({ loader: counted }));
  setComviOptions({ fallbackLocale: "en", ...data }, factory);
  const hooks: Record<string, () => void> = {};
  const vueApp = createApp({ render: () => null });
  const nuxtApp = Object.assign(nuxtAppMocks.useNuxtApp(), {
    vueApp,
    payload,
    ssrContext: event ? { event, url } : undefined,
    hook: (name: string, fn: () => void) => void (hooks[name] = fn),
  });
  const plugin = (await import("../src/runtime/plugin")).default;
  const { provide } = (await plugin.setup(nuxtApp as never)) as { provide: { i18n: VueI18n } };
  return { i18n: provide.i18n, hooks, nuxtApp, calls, factory };
}

describe("the plugin on the server", () => {
  beforeEach(() => vi.stubGlobal("__COMVI_TEST_SERVER__", true));

  it("resolves the request's locale BEFORE the instance exists and creates it in it; one cookie write", async () => {
    const event = { context: {} };
    setMockRequestHeaders({ "accept-language": "uk" });
    const { i18n, calls, factory } = await run({ event, url: "/uk/admin?x=1" });

    expect(i18n.locale).toBe("uk");
    expect(factory).toHaveBeenCalledWith(event);
    // Started in its locale: no load of the default locale's own catalog first.
    expect(calls).toEqual(["uk:default", "en:default"]);
    expect(getMockCookieWrites("i18n_locale")).toEqual(["uk"]);
  });

  it("strips the app's baseURL by segment: /app/uk is uk, /appuk is not under /app", async () => {
    nuxtAppMocks.mockRuntimeConfig.app.baseURL = "/app/";
    expect((await run({ event: { context: {} }, url: "/app/uk/admin" })).i18n.locale).toBe("uk");
    resetMocks();
    nuxtAppMocks.mockRuntimeConfig.public.comvi.locales = ["en", "uk"];
    nuxtAppMocks.mockRuntimeConfig.app.baseURL = "/app/";
    expect((await run({ event: { context: {} }, url: "/appuk" })).i18n.locale).toBe("en");
  });

  it("keeps a stored preference on a path-implied default (as-needed)", async () => {
    setMockCookie("i18n_locale", "uk");
    const { i18n } = await run({ event: { context: {} }, url: "/admin" });

    expect(i18n.locale).toBe("en");
    // The stored value only (setMockCookie's write): nothing new to send.
    expect(getMockCookieWrites("i18n_locale")).toEqual(["uk"]);
  });

  it("registers the instance on the request and hands the snapshot over in app:rendered", async () => {
    const event = { context: {} as Record<string, Set<unknown>> };
    const { i18n, hooks, nuxtApp } = await run({ event, url: "/" });

    expect([...event.context.__comvi!]).toEqual([i18n]);
    expect(nuxtApp.payload.comvi).toBeUndefined();
    await i18n.load("admin");
    hooks["app:rendered"]!();
    expect(nuxtApp.payload.comvi).toMatchObject({
      locale: "en",
      timeZone: "UTC",
      catalogs: { default: { en: CATALOGS["en:default"] }, admin: { en: CATALOGS["en:admin"] } },
    });
  });
});

describe("the snapshot and the inline comvi.messages", () => {
  beforeEach(() => vi.stubGlobal("__COMVI_TEST_SERVER__", true));

  it("leaves out the slots of the inline catalogs: the browser has them from its bundle", async () => {
    const event = { context: {} };
    const { i18n, hooks, nuxtApp } = await run({
      event,
      url: "/",
      data: { messages: { uk: { hello: "Привіт (inline)" } } },
    });
    expect(i18n.ns("default")("hello", { locale: "uk" } as never)).toBe("Привіт (inline)");
    hooks["app:rendered"]!();
    expect(
      Object.keys((nuxtApp.payload.comvi as { catalogs: { default: object } }).catalogs.default),
    ).toEqual(["en"]);
  });

  it("keeps an inline slot a server add() changed: the bundle has the catalog without the patch", async () => {
    const { i18n, hooks, nuxtApp } = await run({
      event: { context: {} },
      url: "/",
      data: { messages: { uk: { hello: "Привіт (inline)" } } },
    });
    i18n.add("uk", { extra: "Додано на сервері" });
    hooks["app:rendered"]!();
    const slots = (nuxtApp.payload.comvi as { catalogs: { default: Record<string, object> } })
      .catalogs.default;
    expect(slots.uk).toEqual({ hello: "Привіт (inline)", extra: "Додано на сервері" });
  });
});

describe("the plugin in the browser", () => {
  it("starts from the snapshot: its locale and catalogs, a null slot included, and asks the loader for nothing", async () => {
    const { i18n, calls, factory } = await run({
      payload: {
        comvi: {
          locale: "uk",
          timeZone: "UTC",
          serverNow: 0,
          catalogs: {
            default: { uk: CATALOGS["uk:default"], en: CATALOGS["en:default"] },
            admin: { uk: null, en: CATALOGS["en:admin"] },
          },
        },
      },
    });

    expect(factory).toHaveBeenCalledWith(undefined);
    expect(i18n.locale).toBe("uk");
    expect(i18n.t("hello")).toBe("Привіт");
    expect(i18n.ns("admin")("title")).toBe("Admin");
    expect(calls).toEqual([]);
    // The server's null is a failed pair: an explicit retry asks again.
    await i18n.load("admin").catch(() => {});
    expect(calls).toEqual(["uk:admin"]);
  });

  it("with no snapshot (no server render) resolves the locale from the location and the cookie", async () => {
    history.replaceState(null, "", "/uk/admin");
    const { i18n } = await run();
    expect(i18n.locale).toBe("uk");
    history.replaceState(null, "", "/");
  });

  it("records a locale change outside a navigation in the cookie; a navigation's own change is the middleware's", async () => {
    const { i18n, nuxtApp } = await run({
      payload: {
        comvi: {
          locale: "en",
          timeZone: "UTC",
          serverNow: 0,
          catalogs: { default: { en: CATALOGS["en:default"] } },
        },
      },
    });
    await i18n.setLocale("uk");
    await nextTick();
    expect(getMockCookieWrites("i18n_locale")).toEqual(["uk"]);

    (nuxtApp as unknown as { _comviNavigating: number })._comviNavigating = 1;
    await i18n.setLocale("en");
    expect(getMockCookieWrites("i18n_locale")).toEqual(["uk"]);
  });
});
