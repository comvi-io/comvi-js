/**
 * Lot 4c through Svelte components, as @comvi/vue's suite: `useI18n(ns)` reads, loads and holds
 * `ns` from mount to destroy; `<T>` reads only; `isReady` / `isLoading` with no "unavailable"
 * frame before the mount; the key scenario.
 */
import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { core } from "../../core/src/internal";
import { T } from "../src";
import Pages from "./fixtures/Pages.svelte";
import Probe from "./fixtures/Probe.svelte";
import { make, manualLoader, mountWith, settle } from "./helpers";

const reports = (errors: { code: string; key?: string }[]) =>
  errors.filter((e) => e.code == "missing_key").map((e) => e.key);

describe("isReady / isLoading", () => {
  it("first load: not ready and loading from the first render (before the mount) to the catalog", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const frames: string[] = [];
    const w = mountWith(i18n, Probe, { ns: "shop", frames });
    expect(frames[0]).toBe("false/true");
    expect(frames).not.toContain("false/false");
    expect(w.text()).toBe("loading");
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    expect(w.text()).toBe("Shop");
    expect(frames.at(-1)).toBe("true/false");
    expect(frames).not.toContain("false/false");
  });

  it("a usable catalog while loading: ready and loading; a failed load: neither", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({
      locale: "en",
      fallbackLocale: "en",
      catalogs: { default: { en: {} }, shop: { en: { title: "Shop" } } },
      loader: l.load,
    });
    const frames: string[] = [];
    const w = mountWith(i18n, Probe, { ns: "shop", frames });
    expect(w.text()).toBe("Shop");
    const p = i18n.setLocale("de").catch(() => {});
    await settle();
    expect(frames.at(-1)).toBe("true/true");
    await l.answer("de:default");
    await l.fail("de:shop");
    await p;
    await settle();
    expect(frames.at(-1)).toBe("true/false");
    expect(errors.some((e) => e.code == "load_failed")).toBe(true);

    const m = manualLoader();
    const c = make({ locale: "en", messages: { en: {} }, loader: m.load });
    const w2 = mountWith(c.i18n, Probe, { ns: "shop" });
    await m.fail("en:shop");
    expect(w2.text()).toBe("unavailable");
  });

  it("a catalog of a locale outside the chain is not ready; with fallbackLocale it is", () => {
    const shop = { catalogs: { shop: { de: { title: "Laden" } } } };
    const a = mountWith(make({ locale: "en", messages: { en: {} }, ...shop }).i18n, Probe, {
      ns: "shop",
    });
    expect(a.text()).toBe("unavailable");
    const b = mountWith(
      make({ locale: "en", fallbackLocale: "de", messages: { en: {} }, ...shop, onError() {} })
        .i18n,
      Probe,
      { ns: "shop" },
    );
    expect(b.text()).toBe("Laden");
  });
});

describe("consumers", () => {
  it("two consumers share one flight; destroying one keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const api: { set?: (v: string[]) => void } = {};
    const w = mountWith(i18n, Pages, { initial: ["shop", "shop"], api });
    expect(l.requested).toEqual(["en:shop"]);
    expect(core(i18n).k.shop).toBe(2);
    api.set!(["shop"]);
    flushSync();
    expect(core(i18n).k.shop).toBe(1);
    await l.answer("en:shop", { title: "Shop" });
    expect(w.text()).toBe("Shop");
    void i18n.setLocale("de");
    await settle();
    expect(l.requested).toContain("de:shop");
  });

  it("the last consumer destroyed keeps the cache; the next switch does not load it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const api: { set?: (v: string[]) => void } = {};
    mountWith(i18n, Pages, { initial: ["shop"], api });
    await l.answer("en:shop", { title: "Shop" });
    api.set!([]);
    flushSync();
    expect(core(i18n).k.shop).toBe(0);
    expect(i18n.t("title", { ns: "shop" })).toBe("Shop");
    void i18n.setLocale("de");
    await settle();
    expect(l.requested).not.toContain("de:shop");
  });

  it("a remount after a failed load asks for nothing; i18n.load(ns) retries", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const a = mountWith(i18n, Probe, { ns: "shop" });
    await l.fail("en:shop");
    a.unmount();
    const b = mountWith(i18n, Probe, { ns: "shop" });
    await settle();
    expect(l.requested).toEqual(["en:shop"]);
    expect(b.text()).toBe("unavailable");
    void i18n.load("shop");
    await settle();
    expect(l.requested).toEqual(["en:shop", "en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    expect(b.text()).toBe("Shop");
  });
});

describe("reading never loads", () => {
  it("<T ns> requests nothing and takes no namespace of a useI18n(ns) above it", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { title: "Home" } }, shop: { en: { title: "Shop" } } },
      loader: l.load,
      onError() {},
    });
    const a = mountWith(i18n, T, { i18nKey: "title", ns: "account" });
    await settle();
    expect(l.requested).toEqual([]);
    expect(a.text()).toBe("title");
    expect(mountWith(i18n, T, { i18nKey: "title" }).text()).toBe("Home");
    expect(mountWith(i18n, T, { i18nKey: "title", ns: "shop" }).text()).toBe("Shop");
    expect(core(i18n).k.shop ?? 0).toBe(0);
  });

  it("t() of a useI18n() reads what its own useI18n holds, no idle warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    mountWith(i18n, Probe, { ns: "shop" });
    await l.answer("en:shop", { title: "Shop" });
    await settle();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("shop");
  });
});

describe("missing_key", () => {
  it("silent while a load that could bring the key is coming; reported for a key the catalog lacks", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const w = mountWith(i18n, Probe, { ns: "shop", k: "absent" });
    expect(reports(errors)).toEqual([]);
    await l.answer("en:shop", { title: "Shop" });
    expect(w.text()).toBe("absent");
    expect(reports(errors)).toContain("absent");
  });
});

describe("setLocale() and the active need", () => {
  it("the key scenario: account → default page → switch: only default loads; back on account: loading, then the text", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { title: "Home" } } },
      loader: l.load,
    });
    const api: { set?: (v: string[]) => void } = {};
    const w = mountWith(i18n, Pages, { initial: ["account"], api });
    await l.answer("en:account", { title: "Account" });
    expect(w.text()).toBe("Account");
    api.set!(["default"]);
    flushSync();
    const s = i18n.setLocale("de");
    await settle();
    await l.answer("de:default", { title: "Start" });
    await s;
    await settle();
    expect(w.text()).toBe("Start");
    expect(l.requested).not.toContain("de:account");
    api.set!(["account"]);
    flushSync();
    expect(w.text()).toBe("loading");
    expect(l.requested).toContain("de:account");
    await l.answer("de:account", { title: "Konto" });
    expect(w.text()).toBe("Konto");
  });

  it("a consumer mounted while a switch is pending ends with the applied locale's catalog", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const p = i18n.setLocale("de");
    await settle();
    const w = mountWith(i18n, Probe, { ns: "shop" });
    await l.answer("de:default", {});
    await l.answer("en:shop", { title: "Shop" }).catch(() => {});
    await settle();
    await l.answer("de:shop", { title: "Laden" });
    await p;
    await settle();
    expect(w.text()).toBe("Laden");
  });
});

describe("a released consumer is not loading forever", () => {
  it("a useI18n result kept after its component unmounts: false/false after a switch", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const out: { u?: { isReady: boolean; isLoading: boolean } } = {};
    const w = mountWith(i18n, Probe, { ns: "shop", out });
    await l.answer("en:shop", { title: "Shop" });
    w.unmount();
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    await settle();
    expect([out.u!.isReady, out.u!.isLoading]).toEqual([false, false]);
    expect(l.requested).toEqual(["en:shop", "de:default"]);
  });
});
