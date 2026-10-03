import { beforeEach, describe, expect, it, vi } from "vitest";
import { nodeResponseStub } from "./mocks/node-response";

/**
 * `useTranslation`'s namespace option is `ns`, the word core's `t(key, { ns })`
 * and next's `getI18n({ ns })` already use. `namespace` is the 0.4 spelling,
 * kept as a deprecated alias for 0.5 and removed in 0.6. See
 * `docs/design/next-nuxt-parity.md` for why the vocabulary is shared even
 * though the adapters are not.
 */

const getCookie = vi.fn();
const getHeader = vi.fn();
const createComviCore = vi.fn();
const runComviSetup = vi.fn(async () => undefined);

vi.mock("h3", () => ({ getCookie, getHeader }));
vi.mock("#build/comvi.host", () => ({ createComviCore }));
vi.mock("#build/comvi.setup", () => ({ runComviSetup }));

function createEvent() {
  return {
    node: { res: nodeResponseStub() },
    context: {
      runtimeConfig: {
        public: {
          comvi: {
            locales: ["en", "de"],
            defaultLocale: "en",
            cookieName: "i18n_locale",
            defaultNs: "common",
            detectBrowserLanguage: { useCookie: true, fallbackLocale: "en" },
          },
        },
        comvi: {},
      },
    },
  } as never;
}

function createI18nStub() {
  const loaded = new Set<string>();
  const i18n: Record<string, unknown> = {
    locale: "en",
    init: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
    setLocaleAsync: vi.fn(async (next: string) => {
      i18n.locale = next;
    }),
    hasLocale: vi.fn((locale: string, ns = "common") => loaded.has(`${locale}:${ns}`)),
    // No fallback chain: the chain is pinned with real hosts in
    // `ssr-fallback-contract.test.ts`.
    getFallbackLocales: vi.fn((): string[] => []),
    t: vi.fn(() => "translated-value"),
    hasTranslation: vi.fn(() => true),
    registerLoader: vi.fn(),
    getLoader: vi.fn(() => ({ name: "loader" })),
    reloadTranslations: vi.fn().mockResolvedValue(undefined),
    addActiveNamespaces: vi.fn().mockResolvedValue(undefined),
    removeActiveNamespace: vi.fn(),
    removeActiveNamespaces: vi.fn(),
    onLoadError: vi.fn(() => () => {}),
    addActiveNamespace: vi.fn(async (ns: string) => {
      loaded.add(`${String(i18n.locale)}:${ns}`);
    }),
  };
  return i18n;
}

/** A fresh module each time: the both-options warning fires once per module. */
async function importUseTranslation() {
  vi.resetModules();
  return (await import("../src/runtime/server/utils/useTranslation")).useTranslation;
}

describe("useTranslation namespace vocabulary", () => {
  beforeEach(() => {
    getCookie.mockReset();
    getHeader.mockReset();
    createComviCore.mockReset();
    runComviSetup.mockReset();
    runComviSetup.mockResolvedValue(undefined);
  });

  it("binds `ns` into t() and loads that namespace", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), { locale: "de", ns: "admin" });
    t("hello");

    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "de", ns: "admin" }),
    );
    expect(i18n.addActiveNamespace).toHaveBeenCalledWith("admin");
  });

  it("still honours the deprecated `namespace` alias on its own", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), { locale: "de", namespace: "admin" });
    t("hello");

    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "de", ns: "admin" }),
    );
  });

  it("answers hasTranslation against `ns` too", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { hasTranslation } = await useTranslation(createEvent(), { locale: "de", ns: "admin" });
    hasTranslation("hello");

    expect(i18n.hasTranslation).toHaveBeenCalledWith("hello", "de", "admin");
  });

  it("lets `ns` win when both are passed", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), {
      locale: "de",
      ns: "admin",
      namespace: "legacy",
    });
    t("hello");

    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "de", ns: "admin" }),
    );
  });

  it("treats an empty `ns` as not given, leaving `namespace` in charge", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), {
      locale: "de",
      ns: "",
      namespace: "admin",
    });
    t("hello");

    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "de", ns: "admin" }),
    );
  });

  it("does not claim `ns` won when an empty `ns` was not given at all", async () => {
    vi.stubGlobal("__COMVI_TEST_DEV__", true);
    createComviCore.mockReturnValue(createI18nStub());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { locale: "de", ns: "", namespace: "admin" });

    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to defaultNs when an empty `ns` is the only option given", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { t } = await useTranslation(createEvent(), { locale: "de", ns: "" });
    t("hello");

    expect(i18n.t).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ locale: "de", ns: "common" }),
    );
  });

  it("warns once in dev when both are passed, naming which one won", async () => {
    vi.stubGlobal("__COMVI_TEST_DEV__", true);
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { locale: "de", ns: "admin", namespace: "legacy" });
    await useTranslation(createEvent(), { locale: "de", ns: "admin", namespace: "legacy" });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("[@comvi/nuxt]");
    expect(message).toContain("ns");
    expect(message).toContain("namespace");
  });

  it("stays silent when only one of the two is passed", async () => {
    vi.stubGlobal("__COMVI_TEST_DEV__", true);
    createComviCore.mockReturnValue(createI18nStub());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { ns: "admin" });
    await useTranslation(createEvent(), { namespace: "admin" });
    await useTranslation(createEvent(), {});

    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing in production, where the warning would only cost bytes on the wire", async () => {
    // `__COMVI_TEST_DEV__` left unstubbed: the vitest seam for `import.meta.dev`
    // defaults to undefined, which is what a production build evaluates to.
    createComviCore.mockReturnValue(createI18nStub());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const useTranslation = await importUseTranslation();

    await useTranslation(createEvent(), { locale: "de", ns: "admin", namespace: "legacy" });

    expect(warn).not.toHaveBeenCalled();
  });
});
