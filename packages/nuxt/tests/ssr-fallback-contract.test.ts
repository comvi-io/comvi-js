import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { NuxtApp } from "#app";
import { createI18n as createCoreI18n } from "@comvi/core";
import { acquireLoaderApi, attachLoader } from "@comvi/core/loader";
import { createI18n as createVueI18n } from "@comvi/vue";
import {
  SSR_FALLBACK_CASES,
  SSR_FALLBACK_CATALOGS,
  SSR_FALLBACK_DEFAULT_NS,
  SSR_FALLBACK_LOCALES,
  SSR_FALLBACK_ON_ERROR_PER_FAILED_LOAD,
  type SsrFallbackCase,
} from "@comvi/test-utils/ssrFallbackContract";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { createComviCore, createComviI18n, resetComviI18nMock } from "./mocks/comvi-i18n";
import { resetComviSetupMock } from "./mocks/comvi-setup";
import { nodeResponseStub } from "./mocks/node-response";
import { loadMessages } from "../src/runtime/server/utils/loadMessages";
import { useTranslation } from "../src/runtime/server/utils/useTranslation";
import plugin from "../src/runtime/plugin";

/**
 * `@comvi/nuxt` against the shared server fallback-chain contract
 * (`@comvi/test-utils/ssrFallbackContract`). Every row runs through BOTH of
 * nuxt's SSR paths:
 * - the server utilities: `useTranslation()` with no prior
 *   `loadMessages()`, then `loadMessages()` for the client catalogs,
 *   one request event per row request, concurrently;
 * - the app plugin: its SSR pass (plugin, then the middleware's locale switch),
 *   the payload it writes, and a client plugin hydrating from that payload.
 *
 * Real core and VueI18n hosts with a loader throughout: the bug lived in which
 * pairs got fetched, which a stub would only restate. Nuxt-only assertions
 * follow the table.
 */

vi.mock("h3", () => ({ getCookie: vi.fn(), getHeader: vi.fn() }));

type Loader = Mock<(locale: string, ns: string) => Promise<Record<string, string>>>;
type Catalogs = Record<string, Record<string, string>>;

const createLoader = (row: SsrFallbackCase): Loader => {
  const failing = new Set(row.failing);
  return vi.fn(async (locale: string, ns: string) => {
    if (failing.has(`${locale}:${ns}`)) throw new Error(`offline ${locale}:${ns}`);
    return { ...SSR_FALLBACK_CATALOGS[`${locale}:${ns}`] };
  });
};

const fetchedPairs = (loader: Loader) => loader.mock.calls.map(([locale, ns]) => `${locale}:${ns}`);

const comviConfig = (row: Pick<SsrFallbackCase, "defaultLocale" | "fallbackLocale">) => ({
  locales: [...SSR_FALLBACK_LOCALES],
  localeObjects: {},
  defaultLocale: row.defaultLocale,
  localePrefix: "as-needed" as const,
  defaultNs: SSR_FALLBACK_DEFAULT_NS,
  fallbackLocale: row.fallbackLocale as string,
  localeCookie: false as const,
  localeDetection: false as const,
});

/** What every server host reported, across the hosts a row built. */
interface Reports {
  loadErrors: string[];
  onError: Array<{ mock: { calls: unknown[] } }>;
}

const observe = (host: ReturnType<typeof attachLoader>, reports: Reports) => {
  host.onLoadError((locale, namespace) => reports.loadErrors.push(`${locale}:${namespace}`));
  reports.onError.push(vi.spyOn(host, "reportError"));
};

/** The fetch and error-reporting surface shared by both paths. */
const expectServerSide = (row: SsrFallbackCase, loader: Loader, reports: Reports) => {
  const fetched = fetchedPairs(loader);
  expect(fetched).toEqual(expect.arrayContaining([...(row.fetched ?? [])]));
  for (const pair of row.notFetched ?? []) expect(fetched).not.toContain(pair);
  expect([...reports.loadErrors].sort()).toEqual([...row.loadErrors].sort());
  for (const pair of row.failing ?? []) {
    expect(fetched.filter((p) => p === pair)).toHaveLength(
      row.loadErrors.filter((p) => p === pair).length,
    );
  }
  const onErrorCalls = reports.onError.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
  expect(onErrorCalls).toBe(SSR_FALLBACK_ON_ERROR_PER_FAILED_LOAD * reports.loadErrors.length);
};

const rows = SSR_FALLBACK_CASES.map((row) => [row.name, row] as const);

describe("@comvi/nuxt server utilities: the server fallback-chain contract", () => {
  beforeEach(() => {
    resetComviI18nMock();
    resetComviSetupMock();
  });

  it.each(rows)("%s", async (_name, row) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ns = row.ns ?? SSR_FALLBACK_DEFAULT_NS;
    const loader = createLoader(row);
    const reports: Reports = { loadErrors: [], onError: [] };
    createComviCore.mockImplementation((options: Record<string, unknown>) => {
      const host = attachLoader(createCoreI18n(options as never));
      host.registerLoader(loader);
      if (row.cached) host.addMessages(row.cached as Catalogs);
      observe(host, reports);
      return host;
    });

    const served = await Promise.all(
      row.requests.map(async (request) => {
        const event = {
          node: { res: nodeResponseStub() },
          context: { runtimeConfig: { public: { comvi: comviConfig(row) }, comvi: {} } },
        } as never;
        const { t, locale } = await useTranslation(event, { locale: request.locale, ns });
        const texts = Object.fromEntries(
          Object.keys(request.expect).map((key) => [key, t(key as never)]),
        );
        const messages = await loadMessages(event, request.locale, { namespaces: [ns] });
        return { locale, texts, messages };
      }),
    );

    row.requests.forEach((request, index) => {
      expect(served[index].locale).toBe(request.locale);
      expect(served[index].texts).toEqual(request.expect);
      expect(Object.keys(served[index].messages)).toEqual(request.clientCatalogs);
    });
    expectServerSide(row, loader, reports);
  });

  it("concurrent loads of one pair in one request → one fetch", async () => {
    const [row] = SSR_FALLBACK_CASES;
    const loader = createLoader(row);
    createComviCore.mockImplementation((options: Record<string, unknown>) => {
      const host = attachLoader(createCoreI18n(options as never));
      host.registerLoader(loader);
      return host;
    });
    const event = {
      node: { res: nodeResponseStub() },
      context: { runtimeConfig: { public: { comvi: comviConfig(row) }, comvi: {} } },
    } as never;

    await Promise.all([
      useTranslation(event, { locale: "fr" }),
      loadMessages(event, "fr"),
      loadMessages(event, "fr"),
    ]);

    const fetched = fetchedPairs(loader);
    expect(fetched.filter((pair) => pair === "de:common")).toHaveLength(1);
  });
});

// ─── app plugin: SSR → payload → hydration → navigation ────────────────────

type NuxtAppStub = NuxtApp & { hook: Mock; payload: Record<string, unknown> };

const createNuxtApp = (payload: Record<string, unknown> = {}) =>
  ({ vueApp: { use: vi.fn() }, hook: vi.fn(), payload }) as unknown as NuxtAppStub;

type PluginI18n = {
  t: (key: string, params?: Record<string, unknown>) => string;
  setLocale: (locale: string) => Promise<void>;
  locale: { value: string };
  core: ReturnType<typeof attachLoader>;
};

/**
 * The app host: a real VueI18n with the loader composed onto its core. On the
 * server, the row's pre-cached catalogs are in the host before `init()`, as a
 * catalog `comvi.setup` adds would be.
 */
function serveAppHost(row: SsrFallbackCase, loader: Loader, server?: { reports: Reports }) {
  createComviI18n.mockImplementation((options: Record<string, unknown>) => {
    const i18n = createVueI18n({ ...options, exposeGlobal: false } as never).use(attachLoader);
    i18n.core.registerLoader(loader);
    if (server) {
      if (row.cached) i18n.core.addMessages(row.cached as Catalogs);
      observe(i18n.core, server.reports);
    }
    return i18n;
  });
}

async function runPlugin(nuxtApp: NuxtAppStub) {
  const result = (await plugin.setup(nuxtApp)) as unknown as { provide: { i18n: PluginI18n } };
  return result.provide.i18n;
}

/** What a page component does for a namespace it needs: activate it, awaited in setup. */
const activateDuringRender = async (i18n: PluginI18n, ns: string) => {
  if (ns !== SSR_FALLBACK_DEFAULT_NS) {
    await acquireLoaderApi(i18n.core).addActiveNamespace(ns);
  }
};

const translateAll = (i18n: PluginI18n, keys: readonly string[], ns: string) =>
  Object.fromEntries(keys.map((key) => [key, i18n.t(key, { ns })]));

describe("@comvi/nuxt app plugin: the server fallback-chain contract", () => {
  beforeEach(() => {
    resetComviI18nMock();
    resetComviSetupMock();
  });

  it.each(rows)("%s", async (_name, row) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ns = row.ns ?? SSR_FALLBACK_DEFAULT_NS;
    const loader = createLoader(row);
    const reports: Reports = { loadErrors: [], onError: [] };

    // The plugin reads module-level Nuxt state, so requests render one by one;
    // each still gets its own host, as each SSR request does.
    for (const [index, request] of row.requests.entries()) {
      nuxtAppMocks.resetMocks();
      Object.assign(nuxtAppMocks.mockRuntimeConfig.public.comvi, comviConfig(row));
      const keys = Object.keys(request.expect);

      // Server: plugin, the middleware's locale switch, then the page, which
      // activates its namespace during the render, then the payload.
      vi.stubGlobal("__COMVI_TEST_SERVER__", true);
      serveAppHost(row, loader, { reports });
      const serverApp = createNuxtApp();
      const server = await runPlugin(serverApp);
      await server.setLocale(request.locale);
      await activateDuringRender(server, ns);
      expect(translateAll(server, keys, ns)).toEqual(request.expect);
      const rendered = serverApp.hook.mock.calls.find(([event]) => event === "app:rendered");
      (rendered![1] as () => void)();
      vi.stubGlobal("__COMVI_TEST_SERVER__", false);

      const payload = serverApp.payload.__comvi_messages__ as Catalogs;
      // The payload carries the whole SSR cache (the host's init locale too),
      // so it must CONTAIN the row's client catalogs and none that failed.
      expect(Object.keys(payload)).toEqual(expect.arrayContaining([...request.clientCatalogs]));
      for (const pair of row.failing ?? []) expect(Object.keys(payload)).not.toContain(pair);

      // Client: hydrates from the payload and renders the same text without a
      // single fetch.
      const clientLoader = createLoader(row);
      serveAppHost(row, clientLoader);
      const client = await runPlugin(createNuxtApp({ __comvi_messages__: payload }));
      expect(clientLoader).not.toHaveBeenCalled();
      await activateDuringRender(client, ns);
      expect(clientLoader).not.toHaveBeenCalled();
      expect(client.locale.value).toBe(request.locale);
      expect(translateAll(client, keys, ns)).toEqual(request.expect);

      if (index === 0 && row.navigation) {
        const navigation = row.navigation;
        await client.setLocale(navigation.locale);
        expect(translateAll(client, Object.keys(navigation.expect), ns)).toEqual(navigation.expect);
        // The fallback catalogs came with the payload, not from a client fetch.
        const fallbacks = navigation.clientCatalogs.filter(
          (pair) => !pair.startsWith(`${navigation.locale}:`),
        );
        for (const pair of fallbacks) expect(fetchedPairs(clientLoader)).not.toContain(pair);
      }
    }

    expectServerSide(row, loader, reports);
  });
});

describe("@comvi/nuxt app plugin: the activation wrapper", () => {
  beforeEach(() => {
    resetComviI18nMock();
    resetComviSetupMock();
  });

  it("a factory that returns one shared host → wrapped once, not once per request", async () => {
    const [row] = SSR_FALLBACK_CASES;
    nuxtAppMocks.resetMocks();
    Object.assign(nuxtAppMocks.mockRuntimeConfig.public.comvi, comviConfig(row));
    const loader = createLoader(row);
    const shared = createVueI18n({ locale: "en", exposeGlobal: false } as never).use(attachLoader);
    shared.core.registerLoader(loader);
    createComviI18n.mockReturnValue(shared);
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);

    await runPlugin(createNuxtApp());
    const wrapped = shared.core.addActiveNamespaces;
    await runPlugin(createNuxtApp());

    expect(shared.core.addActiveNamespaces).toBe(wrapped);
  });
});
