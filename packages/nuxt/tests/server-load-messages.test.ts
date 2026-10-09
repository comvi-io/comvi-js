import { beforeEach, describe, expect, it, vi } from "vitest";
import { nodeResponseStub } from "./mocks/node-response";

const createComviCore = vi.fn();
const runComviSetup = vi.fn(async () => undefined);

vi.mock("#comvi/i18n", () => ({
  createComviCore,
}));

vi.mock("#comvi/setup", () => ({
  runComviSetup,
}));

// The host HAS the loader capability here, so the fix is the registration, not
// the composition — and the message names only shapes the docs teach: the import
// map goes where the capability is composed, and a bare LoaderFn is registered
// from `comvi.setup`, whose context destructures `core`. `registerPlugin(...)` is
// NOT one of them: the generated default host has no plugin capability. One
// attach-only composition is named, because `attachLoader` is the only one core
// publishes — `loader(map)` requires its map and therefore always registers.
const NO_LOADER_REGISTERED_MESSAGE =
  "[@comvi/nuxt] No loader registered, so SSR loaded nothing. This i18n instance has the loader " +
  "capability: pass the import map where you compose it — " +
  "createI18n(options).use(loader(map)) in your `i18nModule` factory — or, on an instance " +
  "composed with .use(attachLoader), register a LoaderFn from " +
  "comvi.setup: (({ core }) => { core.registerLoader(fn); }).";

function createEvent(runtimeConfigOverrides: Partial<any> = {}) {
  return {
    node: { res: nodeResponseStub() },
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            defaultNs: "default",
            fallbackLocale: "en",
            defaultLocale: "en",
          },
        },
        comvi: {},
        ...runtimeConfigOverrides,
      },
    },
  } as any;
}

type StubTranslations = Record<string, Record<string, string>>;

function createI18nStub(
  options: {
    hasLoader?: boolean;
    loaderCapability?: boolean;
    initialLanguage?: string;
    defaultNs?: string;
    cached?: StubTranslations;
    remote?: StubTranslations;
    reloadErrors?: string[];
  } = {},
) {
  const {
    hasLoader = true,
    loaderCapability = true,
    initialLanguage = "en",
    defaultNs = "default",
    cached = {},
    remote = {},
    reloadErrors = [],
  } = options;

  const loaded = new Set(Object.keys(cached));
  const translations = new Map(Object.entries(cached));

  // The BASE host — what the generated default `#build/comvi.i18n` builds.
  const i18n: any = {
    locale: initialLanguage,
    on: vi.fn(() => () => {}),
    init: vi.fn().mockResolvedValue(undefined),
    setLocale: vi.fn(async (newLocale: string) => {
      i18n.locale = newLocale;
    }),
    getDefaultNamespace: vi.fn(() => defaultNs),
    hasLocale: vi.fn((locale: string, namespace = defaultNs) =>
      loaded.has(`${locale}:${namespace}`),
    ),
    // No fallback chain: the chain is pinned with real hosts in
    // `ssr-fallback-contract.test.ts`.
    getFallbackLocales: vi.fn((): string[] => []),
    getMessages: vi.fn((locale: string, namespace = defaultNs) => {
      const key = `${locale}:${namespace}`;
      return translations.get(key) ?? Object.create(null);
    }),
  };

  if (!loaderCapability) {
    return i18n;
  }

  // `@comvi/core/loader` attaches all-or-nothing, and core's `hasLoaderApi`
  // probes for the WHOLE surface — a stub carrying only the two members this
  // file drives would read as capability-less and silently take the wrong
  // branch, so the composed shape is modelled in full.
  Object.assign(i18n, {
    registerLoader: vi.fn(),
    getLoader: vi.fn(() => (hasLoader ? { name: "loader" } : undefined)),
    addActiveNamespace: vi.fn().mockResolvedValue(undefined),
    addActiveNamespaces: vi.fn().mockResolvedValue(undefined),
    removeActiveNamespace: vi.fn(),
    removeActiveNamespaces: vi.fn(),
    onLoadError: vi.fn(() => () => {}),
    reloadMessages: vi.fn(async (locale: string, namespace: string) => {
      const key = `${locale}:${namespace}`;
      if (reloadErrors.includes(key)) {
        throw new Error(`load failed for ${key}`);
      }
      const value = remote[key];
      if (!value) {
        throw new Error(`missing remote payload for ${key}`);
      }
      translations.set(key, value);
      loaded.add(key);
    }),
  });

  return i18n;
}

async function importLoadMessages() {
  vi.resetModules();
  return (await import("../src/runtime/server/utils/loadMessages")).loadMessages;
}

describe("loadMessages", () => {
  beforeEach(() => {
    createComviCore.mockReset();
    runComviSetup.mockReset();
    runComviSetup.mockResolvedValue(undefined);
  });

  it("loads requested namespaces via configured i18n loader pipeline", async () => {
    const i18n = createI18nStub({
      remote: {
        "en:common": { hello: "Hello" },
        "en:dashboard": { title: "Dashboard" },
      },
    });
    createComviCore.mockReturnValue(i18n);

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en", {
      namespaces: ["common", "dashboard"],
    });

    expect(result).toEqual({
      "en:common": { hello: "Hello" },
      "en:dashboard": { title: "Dashboard" },
    });
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);
    expect(i18n.reloadMessages).toHaveBeenCalledTimes(2);
  });

  it("returns cached namespaces without reloading", async () => {
    const i18n = createI18nStub({
      cached: {
        "en:default": { welcome: "Welcome" },
      },
    });
    createComviCore.mockReturnValue(i18n);

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en");

    expect(result).toEqual({
      "en:default": { welcome: "Welcome" },
    });
    expect(i18n.reloadMessages).not.toHaveBeenCalled();
  });

  it("continues when one namespace fails to load", async () => {
    const i18n = createI18nStub({
      remote: {
        "en:common": { hello: "Hello" },
      },
      reloadErrors: ["en:admin"],
    });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en", {
      namespaces: ["common", "admin"],
    });

    expect(result).toEqual({
      "en:common": { hello: "Hello" },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[@comvi/nuxt] Failed to load en:admin:",
      "load failed for en:admin",
    );
  });

  it("warns when no loader is configured and no cached translations exist", async () => {
    const i18n = createI18nStub({ hasLoader: false });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en");

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(NO_LOADER_REGISTERED_MESSAGE);
  });

  it("warns about missing loader only once per request i18n instance", async () => {
    const i18n = createI18nStub({ hasLoader: false });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadMessages = await importLoadMessages();
    const event = createEvent();

    await loadMessages(event, "en");
    await loadMessages(event, "en");

    const noLoaderWarnings = warnSpy.mock.calls.filter(
      ([message]) => String(message) === NO_LOADER_REGISTERED_MESSAGE,
    );
    expect(noLoaderWarnings).toHaveLength(1);
  });

  it("names the composition fix when the host has no loader CAPABILITY", async () => {
    // The generated default host is core's BASE host, so the fix is a different
    // FILE from "you forgot to register a loader": the capability is composed in
    // the `i18nModule` factory, not in `comvi.setup`.
    const i18n = createI18nStub({ loaderCapability: false });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en");

    expect(result).toEqual({});
    const [message] = warnSpy.mock.lastCall ?? [];
    expect(message).toContain("has no loader capability");
    expect(message).toContain("i18nModule");
    expect(message).toContain("use(loader(map))");
    // A Nuxt app has no direct @comvi/core dependency: the entry is the
    // package's own `/host` subpath.
    expect(message).toContain('"@comvi/nuxt/i18n"');
    expect(message).not.toContain("@comvi/core");
    // The capability-less message must not send a reader to comvi.setup.
    expect(message).not.toContain("registerLoader");
  });

  it("serves cached translations on a capability-less host without warning", async () => {
    // A base host is a legitimate configuration: `comvi.setup` can put a
    // catalog in with addMessages and SSR renders it. Nothing is missing,
    // so nothing is said — and no absent member is ever called.
    const i18n = createI18nStub({
      loaderCapability: false,
      cached: { "en:default": { welcome: "Welcome" } },
    });
    createComviCore.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadMessages = await importLoadMessages();
    const result = await loadMessages(createEvent(), "en");

    expect(result).toEqual({ "en:default": { welcome: "Welcome" } });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent per-request initialization", async () => {
    const i18n = createI18nStub({
      remote: {
        "en:default": { hello: "Hello" },
      },
    });
    let releaseInit!: () => void;
    const initGate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    i18n.init.mockImplementation(async () => {
      await initGate;
    });
    createComviCore.mockReturnValue(i18n);

    const loadMessages = await importLoadMessages();
    const event = createEvent();

    const pendingA = loadMessages(event, "en");
    const pendingB = loadMessages(event, "en");
    // While init is still gated, both calls are in flight: the second joined the
    // first rather than constructing a host of its own.
    await Promise.resolve();
    expect(createComviCore).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);

    releaseInit();
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    // Re-checked after both settled: an init scheduled later in the sequence would
    // be caught here, not only within the first microtask.
    expect(createComviCore).toHaveBeenCalledTimes(1);
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);
    expect(resultA).toEqual({
      "en:default": { hello: "Hello" },
    });
    expect(resultB).toEqual({
      "en:default": { hello: "Hello" },
    });
  });
});
