import { beforeEach, describe, expect, it, vi } from "vitest";
import { nodeResponseStub } from "./mocks/node-response";
import { runtimeLocaleKeys } from "./mocks/locale-options";

/**
 * `useTranslation`'s namespace option is `ns`, the word core's `t(key, { ns })`
 * and next's `getI18n({ ns })` use. There is no other spelling: 0.5 has no
 * aliases, and the type test in `server-types.test-d.ts` rejects `namespace`.
 * See `docs/design/next-nuxt-parity.md`.
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
            defaultNs: "common",
            ...runtimeLocaleKeys(),
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

  it("answers hasTranslation against `ns` too", async () => {
    const i18n = createI18nStub();
    createComviCore.mockReturnValue(i18n);
    const useTranslation = await importUseTranslation();

    const { hasTranslation } = await useTranslation(createEvent(), { locale: "de", ns: "admin" });
    hasTranslation("hello");

    expect(i18n.hasTranslation).toHaveBeenCalledWith("hello", "de", "admin");
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
});
