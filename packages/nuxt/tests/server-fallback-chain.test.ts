import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { NuxtApp } from "#app";
import { createI18n as createCoreI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { createI18n as createVueI18n } from "@comvi/vue";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { createComviCore, createComviI18n, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock } from "./mocks/comvi-setup";
import { nodeResponseStub } from "./mocks/node-response";

/**
 * The server fallback-chain contract, for every SSR entry point nuxt has: the
 * app plugin, the server `loadTranslations()` and `useTranslation()`.
 *
 * Before the server translates, the namespace it needs is loaded for the
 * active locale AND for every locale of the `fallbackLocale` chain, in core's
 * lookup order. A primary catalog already in the cache does not skip the
 * fallback loads. What the server could read reaches the client through the
 * payload. A fallback that fails to load is reported through `loadError`,
 * never thrown, and the render continues.
 *
 * Real core hosts with a loader throughout: the bug lived in which pairs got
 * fetched, which a stub would only restate.
 */

vi.mock("h3", () => ({ getCookie: vi.fn(), getHeader: vi.fn() }));

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { greeting: "Hello", onlyEn: "English only" },
  "de:default": { greeting: "Hallo", onlyDe: "Nur Deutsch" },
  "fr:default": { greeting: "Bonjour" },
  "uk:default": { greeting: "Привіт" },
  "en:admin": { title: "Admin" },
  "de:admin": { title: "Verwaltung", onlyDeAdmin: "Nur Verwaltung" },
  "fr:admin": { title: "Administration" },
};

type Loader = Mock<(locale: string, ns: string) => Promise<Record<string, string>>>;

const createLoader = (failing: ReadonlySet<string> = new Set()): Loader =>
  vi.fn(async (locale: string, ns: string) => {
    if (failing.has(`${locale}:${ns}`)) throw new Error(`offline ${locale}:${ns}`);
    return CATALOGS[`${locale}:${ns}`] ?? {};
  });

const fetched = (loader: Loader) => loader.mock.calls.map(([locale, ns]) => `${locale}:${ns}`);

const comviConfig = (overrides: Record<string, unknown> = {}) => ({
  locales: ["en", "de", "fr", "uk"],
  localeObjects: {},
  defaultLocale: "en",
  localePrefix: "as-needed" as const,
  cookieName: "i18n_locale",
  defaultNs: "default",
  fallbackLocale: "de",
  detectBrowserLanguage: false as const,
  ...overrides,
});

// ─── server utilities ───────────────────────────────────────────────────────

/** Every request host is a real core host with the loader composed on it. */
function serveRealHosts(loader: Loader, seed?: Record<string, Record<string, string>>) {
  const hosts: Array<ReturnType<typeof createHost>> = [];
  const createHost = (options: Record<string, unknown>) => {
    const host = attachLoader(createCoreI18n(options as never));
    host.registerLoader(loader);
    if (seed) host.addTranslations(seed);
    return host;
  };
  createComviCore.mockImplementation((options: Record<string, unknown>) => {
    const host = createHost(options);
    hosts.push(host);
    return host;
  });
  return hosts;
}

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    node: { res: nodeResponseStub() },
    context: {
      runtimeConfig: { public: { comvi: comviConfig(overrides) }, comvi: {} },
    },
  } as never;
}

async function importServerUtils() {
  const [{ loadTranslations }, { useTranslation }] = await Promise.all([
    import("../src/runtime/server/utils/loadTranslations"),
    import("../src/runtime/server/utils/useTranslation"),
  ]);
  return { loadTranslations, useTranslation };
}

describe("server utilities load the fallback chain", () => {
  beforeEach(() => {
    resetComviHostMock();
    resetComviSetupMock();
  });

  it("defaultLocale ≠ fallbackLocale, key only in the fallback → the fallback text", async () => {
    const loader = createLoader();
    serveRealHosts(loader);
    const { loadTranslations, useTranslation } = await importServerUtils();

    const { t } = await useTranslation(createEvent(), { locale: "fr" });
    const messages = await loadTranslations(createEvent(), "fr");

    expect(t("onlyDe")).toBe("Nur Deutsch");
    expect(t("greeting")).toBe("Bonjour");
    expect(Object.keys(messages).sort()).toEqual(["de:default", "fr:default"]);
  });

  it("primary catalog already cached, fallback absent → the fallback is loaded", async () => {
    const loader = createLoader();
    serveRealHosts(loader, { "fr:default": { greeting: "Bonjour" } });
    const { loadTranslations, useTranslation } = await importServerUtils();

    const { t } = await useTranslation(createEvent(), { locale: "fr" });
    expect(t("onlyDe")).toBe("Nur Deutsch");

    const messages = await loadTranslations(createEvent(), "fr");
    expect(messages["de:default"]).toEqual(CATALOGS["de:default"]);
    expect(fetched(loader)).not.toContain("fr:default");
  });

  it("key only in the last catalog of a multi-step chain → resolved", async () => {
    const loader = createLoader();
    serveRealHosts(loader);
    const { loadTranslations, useTranslation } = await importServerUtils();
    const chain = { defaultLocale: "uk", fallbackLocale: ["de", "en"] };

    const { t } = await useTranslation(createEvent(chain), { locale: "fr" });
    const messages = await loadTranslations(createEvent(chain), "fr");

    expect(t("onlyEn")).toBe("English only");
    expect(t("onlyDe")).toBe("Nur Deutsch");
    expect(Object.keys(messages)).toEqual(["fr:default", "de:default", "en:default"]);
  });

  it("a non-default namespace → its fallback is loaded too", async () => {
    const loader = createLoader();
    serveRealHosts(loader);
    const { loadTranslations, useTranslation } = await importServerUtils();

    const { t } = await useTranslation(createEvent(), { locale: "fr", ns: "admin" });
    const messages = await loadTranslations(createEvent(), "fr", { namespaces: ["admin"] });

    expect(t("onlyDeAdmin")).toBe("Nur Verwaltung");
    expect(Object.keys(messages).sort()).toEqual(["de:admin", "fr:admin"]);
  });

  it("useTranslation() without a prior loadTranslations() → resolves through the chain", async () => {
    const loader = createLoader();
    serveRealHosts(loader);
    const { useTranslation } = await importServerUtils();

    const { t, locale } = await useTranslation(createEvent(), { locale: "fr" });

    expect(locale).toBe("fr");
    expect(fetched(loader)).toContain("de:default");
    expect(t("onlyDe")).toBe("Nur Deutsch");
  });

  it("a fallback that fails to load → reported via loadError, the response continues", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loader = createLoader(new Set(["de:default"]));
    const hosts = serveRealHosts(loader);
    const { loadTranslations, useTranslation } = await importServerUtils();
    const loadErrors: string[] = [];
    createComviCore.mockImplementation((options: Record<string, unknown>) => {
      const host = attachLoader(createCoreI18n(options as never));
      host.registerLoader(loader);
      host.onLoadError((locale, ns) => loadErrors.push(`${locale}:${ns}`));
      hosts.push(host);
      return host;
    });

    const { t } = await useTranslation(createEvent(), { locale: "fr" });
    const messages = await loadTranslations(createEvent(), "fr");

    expect(t("greeting")).toBe("Bonjour");
    expect(t("onlyDe")).toBe("onlyDe");
    expect(Object.keys(messages)).toEqual(["fr:default"]);
    expect(loadErrors).toEqual(["de:default", "de:default"]);
    expect(warn).toHaveBeenCalledWith(
      "[@comvi/nuxt] Failed to load de:default:",
      expect.any(String),
    );
  });

  it("concurrent requests in different locales → no locale or catalog leaks", async () => {
    const loader = createLoader();
    const hosts = serveRealHosts(loader);
    const { loadTranslations, useTranslation } = await importServerUtils();
    const frEvent = createEvent();
    const ukEvent = createEvent();

    const [fr, uk, frMessages, ukMessages] = await Promise.all([
      useTranslation(frEvent, { locale: "fr" }),
      useTranslation(ukEvent, { locale: "uk" }),
      loadTranslations(frEvent, "fr"),
      loadTranslations(ukEvent, "uk"),
    ]);

    expect([fr.locale, fr.t("greeting"), fr.t("onlyDe")]).toEqual(["fr", "Bonjour", "Nur Deutsch"]);
    expect([uk.locale, uk.t("greeting"), uk.t("onlyDe")]).toEqual(["uk", "Привіт", "Nur Deutsch"]);
    expect(Object.keys(frMessages).sort()).toEqual(["de:default", "fr:default"]);
    expect(Object.keys(ukMessages).sort()).toEqual(["de:default", "uk:default"]);
    // One host per request and locale, each on its own locale.
    expect(hosts.map((host) => host.locale).sort()).toEqual(["fr", "uk"]);
  });
});

// ─── app plugin: SSR → payload → hydration ──────────────────────────────────

type NuxtAppStub = NuxtApp & {
  hook: Mock;
  vueApp: { use: Mock };
  payload: Record<string, unknown>;
};

const createNuxtApp = (payload: Record<string, unknown> = {}) =>
  ({ vueApp: { use: vi.fn() }, hook: vi.fn(), payload }) as unknown as NuxtAppStub;

type PluginI18n = ReturnType<typeof createVueI18n> & {
  t: (key: string, params?: Record<string, unknown>) => string;
  setLocale: (locale: string) => Promise<void>;
};

type LoaderCore = ReturnType<typeof attachLoader<ReturnType<typeof createCoreI18n>>>;

/** The app host is a real VueI18n with the loader composed onto its core. */
function serveRealAppHost(loader: Loader, setup?: (core: LoaderCore) => void) {
  createComviI18n.mockImplementation((options: Record<string, unknown>) => {
    const i18n = createVueI18n({ ...options, exposeGlobal: false } as never).use(attachLoader);
    i18n.core.registerLoader(loader);
    setup?.(i18n.core as LoaderCore);
    return i18n;
  });
}

async function runPlugin(nuxtApp: NuxtAppStub) {
  const plugin = (await import("../src/runtime/plugin")).default;
  const result = (await plugin.setup(nuxtApp)) as { provide: { i18n: PluginI18n } };
  return result.provide.i18n;
}

/** Server render of one request: plugin, then the middleware's locale switch. */
async function serverRender(locale: string, loader: Loader, ns?: string) {
  vi.stubGlobal("__COMVI_TEST_SERVER__", true);
  // A namespace the app activates before init, as `comvi.setup` would.
  serveRealAppHost(loader, ns ? (core) => void core.addActiveNamespace(ns) : undefined);
  const nuxtApp = createNuxtApp();
  const i18n = await runPlugin(nuxtApp);
  await i18n.setLocale(locale);
  const rendered = i18n.t(ns ? "onlyDeAdmin" : "onlyDe", ns ? { ns } : undefined);
  const hook = nuxtApp.hook.mock.calls.find(([event]) => event === "app:rendered");
  (hook![1] as () => void)();
  vi.stubGlobal("__COMVI_TEST_SERVER__", false);
  return {
    rendered,
    payload: nuxtApp.payload.__comvi_translations__ as Record<string, Record<string, string>>,
  };
}

describe("app plugin ships the fallback chain through the payload", () => {
  beforeEach(() => {
    nuxtAppMocks.resetMocks();
    resetComviHostMock();
    resetComviSetupMock();
    Object.assign(nuxtAppMocks.mockRuntimeConfig.public.comvi, comviConfig());
  });

  it("defaultLocale ≠ fallbackLocale, key only in the fallback → server, hydration and navigation agree", async () => {
    const serverLoader = createLoader();
    const { rendered, payload } = await serverRender("fr", serverLoader);

    expect(rendered).toBe("Nur Deutsch");
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(["fr:default", "de:default"]));

    // Client: hydrates from the payload, then navigates to a locale whose
    // catalog lacks the key.
    const clientLoader = createLoader();
    serveRealAppHost(clientLoader);
    const client = await runPlugin(createNuxtApp({ __comvi_translations__: payload }));
    expect(client.locale.value).toBe("fr");
    expect(client.t("onlyDe")).toBe("Nur Deutsch");

    await client.setLocale("uk");
    expect(client.t("onlyDe")).toBe("Nur Deutsch");
    expect(fetched(clientLoader)).not.toContain("de:default");
  });

  it("key only in the last catalog of a multi-step chain → in the payload", async () => {
    Object.assign(
      nuxtAppMocks.mockRuntimeConfig.public.comvi,
      comviConfig({ defaultLocale: "uk", fallbackLocale: ["de", "en"] }),
    );
    const loader = createLoader();

    vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    serveRealAppHost(loader);
    const nuxtApp = createNuxtApp();
    const i18n = await runPlugin(nuxtApp);
    await i18n.setLocale("fr");

    expect(i18n.t("onlyEn")).toBe("English only");
    expect(fetched(loader)).toEqual(
      expect.arrayContaining(["de:default", "en:default", "fr:default"]),
    );
  });

  it("a non-default namespace active at render → its fallback is in the payload", async () => {
    const loader = createLoader();
    const { rendered, payload } = await serverRender("fr", loader, "admin");

    expect(rendered).toBe("Nur Verwaltung");
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(["fr:admin", "de:admin"]));
  });

  it("a fallback that fails to load → reported, render continues, SSR and client agree", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadErrors: string[] = [];
    const loader = createLoader(new Set(["de:default"]));
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    serveRealAppHost(loader, (core) => {
      core.onLoadError((locale, ns) => loadErrors.push(`${locale}:${ns}`));
    });
    const nuxtApp = createNuxtApp();
    const i18n = await runPlugin(nuxtApp);
    await i18n.setLocale("fr");
    const rendered = i18n.t("onlyDe");
    (nuxtApp.hook.mock.calls.find(([event]) => event === "app:rendered")![1] as () => void)();
    vi.stubGlobal("__COMVI_TEST_SERVER__", false);

    expect(loadErrors).toContain("de:default");
    expect(rendered).toBe("onlyDe");

    const payload = nuxtApp.payload.__comvi_translations__ as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain("de:default");
    serveRealAppHost(createLoader(new Set(["de:default"])));
    const client = await runPlugin(createNuxtApp({ __comvi_translations__: payload }));
    expect(client.t("onlyDe")).toBe(rendered);
  });
});
