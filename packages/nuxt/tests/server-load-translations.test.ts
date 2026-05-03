import { beforeEach, describe, expect, it, vi } from "vitest";

const createI18n = vi.fn();
const runComviSetup = vi.fn(async () => undefined);

vi.mock("@comvi/core", () => ({
  createI18n,
}));

vi.mock("#build/comvi.setup", () => ({
  runComviSetup,
}));

function createEvent(runtimeConfigOverrides: Partial<any> = {}) {
  return {
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            defaultNs: "default",
            fallbackLanguage: "en",
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
    initialLanguage?: string;
    defaultNs?: string;
    cached?: StubTranslations;
    remote?: StubTranslations;
    reloadErrors?: string[];
  } = {},
) {
  const {
    hasLoader = true,
    initialLanguage = "en",
    defaultNs = "default",
    cached = {},
    remote = {},
    reloadErrors = [],
  } = options;

  const loaded = new Set(Object.keys(cached));
  const translations = new Map(Object.entries(cached));

  const i18n: any = {
    locale: initialLanguage,
    init: vi.fn().mockResolvedValue(undefined),
    setLocaleAsync: vi.fn(async (newLocale: string) => {
      i18n.locale = newLocale;
    }),
    getDefaultNamespace: vi.fn(() => defaultNs),
    getLoader: vi.fn(() => (hasLoader ? { name: "loader" } : undefined)),
    hasLocale: vi.fn((locale: string, namespace = defaultNs) =>
      loaded.has(`${locale}:${namespace}`),
    ),
    reloadTranslations: vi.fn(async (locale: string, namespace: string) => {
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
    getTranslations: vi.fn((locale: string, namespace = defaultNs) => {
      const key = `${locale}:${namespace}`;
      return translations.get(key) ?? Object.create(null);
    }),
  };

  return i18n;
}

async function importLoadTranslations() {
  vi.resetModules();
  return (await import("../src/runtime/server/utils/loadTranslations")).loadTranslations;
}

describe("loadTranslations", () => {
  beforeEach(() => {
    createI18n.mockReset();
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
    createI18n.mockReturnValue(i18n);

    const loadTranslations = await importLoadTranslations();
    const result = await loadTranslations(createEvent(), "en", {
      namespaces: ["common", "dashboard"],
    });

    expect(result).toEqual({
      "en:common": { hello: "Hello" },
      "en:dashboard": { title: "Dashboard" },
    });
    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.init).toHaveBeenCalledTimes(1);
    expect(i18n.reloadTranslations).toHaveBeenCalledTimes(2);
  });

  it("returns cached namespaces without reloading", async () => {
    const i18n = createI18nStub({
      cached: {
        "en:default": { welcome: "Welcome" },
      },
    });
    createI18n.mockReturnValue(i18n);

    const loadTranslations = await importLoadTranslations();
    const result = await loadTranslations(createEvent(), "en");

    expect(result).toEqual({
      "en:default": { welcome: "Welcome" },
    });
    expect(i18n.reloadTranslations).not.toHaveBeenCalled();
  });

  it("continues when one namespace fails to load", async () => {
    const i18n = createI18nStub({
      remote: {
        "en:common": { hello: "Hello" },
      },
      reloadErrors: ["en:admin"],
    });
    createI18n.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadTranslations = await importLoadTranslations();
    const result = await loadTranslations(createEvent(), "en", {
      namespaces: ["common", "admin"],
    });

    expect(result).toEqual({
      "en:common": { hello: "Hello" },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[@comvi/nuxt] Failed to load en:admin:",
      "load failed for en:admin",
    );
    warnSpy.mockRestore();
  });

  it("warns when no loader is configured and no cached translations exist", async () => {
    const i18n = createI18nStub({ hasLoader: false });
    createI18n.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadTranslations = await importLoadTranslations();
    const result = await loadTranslations(createEvent(), "en");

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      "[@comvi/nuxt] No loader configured. Register one in comvi.setup via i18n.use(...).",
    );
    warnSpy.mockRestore();
  });

  it("warns about missing loader only once per request i18n instance", async () => {
    const i18n = createI18nStub({ hasLoader: false });
    createI18n.mockReturnValue(i18n);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadTranslations = await importLoadTranslations();
    const event = createEvent();

    await loadTranslations(event, "en");
    await loadTranslations(event, "en");

    const noLoaderWarnings = warnSpy.mock.calls.filter(
      ([message]) =>
        String(message) ===
        "[@comvi/nuxt] No loader configured. Register one in comvi.setup via i18n.use(...).",
    );
    expect(noLoaderWarnings).toHaveLength(1);
    warnSpy.mockRestore();
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
    createI18n.mockReturnValue(i18n);

    const loadTranslations = await importLoadTranslations();
    const event = createEvent();

    const pendingA = loadTranslations(event, "en");
    const pendingB = loadTranslations(event, "en");
    await vi.waitFor(() => {
      expect(createI18n).toHaveBeenCalledTimes(1);
      expect(runComviSetup).toHaveBeenCalledTimes(1);
      expect(i18n.init).toHaveBeenCalledTimes(1);
    });

    releaseInit();
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
    expect(resultA).toEqual({
      "en:default": { hello: "Hello" },
    });
    expect(resultB).toEqual({
      "en:default": { hello: "Hello" },
    });
  });
});
