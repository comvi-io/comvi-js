// @vitest-environment node
/**
 * The server fallback-chain contract.
 *
 * Before a server helper translates, the namespace it needs is loaded for the
 * request locale AND for every locale of the host's `fallbackLocale` chain, in
 * the order core's lookup walks it. A primary catalog already in the cache
 * does not skip the fallback loads. A fallback that fails to load is reported
 * through `loadError`, never thrown, and the render continues.
 *
 * The client half of the contract (what reaches `<I18nProvider messages>`)
 * lives in `fallback-chain-hydration.test.tsx`.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { describe, it, expect, vi, afterEach } from "vitest";

import { createNextI18n } from "../src/createNextI18n";
import { _resetServerI18n, setI18n } from "../src/server/cache";
import { getI18n } from "../src/server/getI18n";
import { loadTranslations } from "../src/server/loadTranslations";
import { setRequestLocale } from "../src/server/setRequestLocale";

// React's `cache()` is per Server Component render. Outside one, each
// `requests.run(...)` below stands in for a render, so two concurrent requests
// get two request stores exactly as they do under Next.
const requests = new AsyncLocalStorage<Map<unknown, unknown>>();
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: () => T) => {
    return () => {
      const store = requests.getStore();
      if (!store) throw new Error("test: no request store");
      if (!store.has(fn)) store.set(fn, fn());
      return store.get(fn) as T;
    };
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const CATALOGS: Record<string, Record<string, string>> = {
  "en:common": { greeting: "Hello", onlyEn: "English only" },
  "de:common": { greeting: "Hallo", onlyDe: "Nur Deutsch" },
  "fr:common": { greeting: "Bonjour" },
  "uk:common": { greeting: "Привіт" },
  "en:admin": { title: "Admin" },
  "de:admin": { title: "Verwaltung", onlyDeAdmin: "Nur Verwaltung" },
  "fr:admin": { title: "Administration" },
};

const createHost = (
  options: { defaultLocale?: string; fallbackLocale?: string | string[] } = {},
  failing: ReadonlySet<string> = new Set(),
) => {
  const { i18n } = createNextI18n({
    locales: ["en", "de", "fr", "uk"],
    defaultLocale: options.defaultLocale ?? "en",
    fallbackLocale: options.fallbackLocale ?? "de",
    defaultNs: "common",
    devMode: false,
  });
  const loader = vi.fn(async (locale: string, ns: string) => {
    if (failing.has(`${locale}:${ns}`)) throw new Error(`offline ${locale}:${ns}`);
    return CATALOGS[`${locale}:${ns}`] ?? {};
  });
  i18n.registerLoader(loader);
  setI18n(i18n);
  return { i18n, loader };
};

const loaded = (loader: ReturnType<typeof vi.fn>) =>
  loader.mock.calls.map(([locale, ns]) => `${locale}:${ns}`);

describe("server helpers load the fallback chain", () => {
  afterEach(() => {
    _resetServerI18n();
  });

  it("defaultLocale ≠ fallbackLocale, key only in the fallback → the fallback text", async () => {
    createHost({ defaultLocale: "en", fallbackLocale: "de" });

    const { t } = await getI18n({ locale: "fr" });

    expect(t("onlyDe")).toBe("Nur Deutsch");
    expect(t("greeting")).toBe("Bonjour");
  });

  it("primary catalog already cached, fallback absent → the fallback is loaded", async () => {
    const { i18n, loader } = createHost();
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour" } });

    const { t } = await getI18n({ locale: "fr" });

    expect(loaded(loader)).toContain("de:common");
    expect(loaded(loader)).not.toContain("fr:common");
    expect(t("onlyDe")).toBe("Nur Deutsch");
  });

  it("key only in the last catalog of a multi-step chain → resolved", async () => {
    const { i18n, loader } = createHost({ defaultLocale: "uk", fallbackLocale: ["de", "en"] });
    i18n.addTranslations({ "fr:common": { greeting: "Bonjour" } });

    const { t } = await getI18n({ locale: "fr" });

    expect(loaded(loader)).toEqual(["uk:common", "de:common", "en:common"]);
    expect(t("onlyEn")).toBe("English only");
    expect(t("onlyDe")).toBe("Nur Deutsch");
  });

  it("a non-default namespace → its fallback is loaded too (getI18n and loadTranslations)", async () => {
    const { i18n, loader } = createHost();
    i18n.addTranslations({ "fr:admin": { title: "Administration" } });

    const { t } = await getI18n({ locale: "fr", ns: "admin" });

    expect(loaded(loader)).toContain("de:admin");
    expect(t("onlyDeAdmin")).toBe("Nur Verwaltung");

    const messages = await loadTranslations("fr", { namespaces: ["admin"] });
    expect(Object.keys(messages).sort()).toEqual(["de:admin", "fr:admin"]);
  });

  it("getI18n() without a prior loadTranslations() → resolves through the chain", async () => {
    const { loader } = createHost();

    const t = await requests.run(new Map(), async () => {
      setRequestLocale("fr");
      return (await getI18n()).t;
    });

    expect(loaded(loader)).toEqual(["en:common", "fr:common", "de:common"]);
    expect(t("onlyDe")).toBe("Nur Deutsch");
  });

  it("a fallback that fails to load → reported via loadError, the render continues", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = createHost({}, new Set(["de:common"]));
    const loadErrors: string[] = [];
    i18n.onLoadError((locale, ns) => loadErrors.push(`${locale}:${ns}`));

    const { t } = await getI18n({ locale: "fr" });

    expect(loadErrors).toEqual(["de:common"]);
    expect(t("greeting")).toBe("Bonjour");
    expect(t("onlyDe")).toBe("onlyDe");
    expect(warn).toHaveBeenCalledWith("[comvi/next] Failed to load de:common:", expect.any(String));
  });

  it("concurrent loads of one pair → one fetch", async () => {
    const { loader } = createHost();

    await Promise.all([loadTranslations("fr"), loadTranslations("fr"), getI18n({ locale: "fr" })]);

    expect(loaded(loader).filter((pair) => pair === "de:common")).toHaveLength(1);
    expect(loaded(loader).filter((pair) => pair === "fr:common")).toHaveLength(1);
  });

  it("concurrent requests in different locales → no locale or catalog leaks", async () => {
    createHost({ defaultLocale: "en", fallbackLocale: "de" });

    const render = (locale: string) =>
      requests.run(new Map(), async () => {
        setRequestLocale(locale);
        const { t, locale: resolved } = await getI18n();
        return { resolved, greeting: t("greeting"), onlyDe: t("onlyDe"), onlyEn: t("onlyEn") };
      });

    const [fr, uk] = await Promise.all([render("fr"), render("uk")]);

    expect(fr).toEqual({
      resolved: "fr",
      greeting: "Bonjour",
      onlyDe: "Nur Deutsch",
      onlyEn: "onlyEn",
    });
    expect(uk).toEqual({
      resolved: "uk",
      greeting: "Привіт",
      onlyDe: "Nur Deutsch",
      onlyEn: "onlyEn",
    });
  });
});
