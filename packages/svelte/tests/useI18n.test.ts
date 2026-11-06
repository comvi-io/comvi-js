import { flushSync, mount } from "svelte";
import { describe, expect, it } from "vitest";
import * as api from "../src";
import { useI18n } from "../src";
import Derived from "./fixtures/Derived.svelte";
import { make, manualLoader, mountWith, settle } from "./helpers";

/** Runs `f` while a component initialises, under `setI18n(i18n)`; returns what it returned. */
const during = <R>(i18n: api.I18n, f: () => R): R => {
  let r: R;
  mountWith(i18n, () => void (r = f()));
  return r!;
};

describe("the package", () => {
  it("exports exactly the 0.8 surface", () => {
    expect(Object.keys(api).sort()).toEqual(["T", "createI18n", "handover", "setI18n", "useI18n"]);
  });

  it("useI18n() returns the eight members of every binding; without setI18n it throws", () => {
    const { i18n } = make({ locale: "ar", messages: { ar: {} } });
    const r = during(i18n, () => useI18n());
    expect(Object.keys(r).sort()).toEqual(
      ["T", "dir", "i18n", "isLoading", "isReady", "locale", "setLocale", "t"].sort(),
    );
    expect([r.locale, r.dir, r.i18n]).toEqual(["ar", "rtl", i18n]);
    const target = document.createElement("div");
    expect(() => mount((() => void useI18n()) as never, { target })).toThrow(
      /\[@comvi\/svelte\] no setI18n/,
    );
  });

  it("the members read the instance's published state on each read", async () => {
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { hi: "Hi" }, de: { hi: "Hallo" } } },
    });
    const r = during(i18n, () => useI18n());
    expect([r.locale, r.t("hi" as never)]).toEqual(["en", "Hi"]);
    await i18n.setLocale("de");
    expect([r.locale, r.t("hi" as never)]).toEqual(["de", "Hallo"]);
  });

  it("the same bound <T> for every caller of a namespace; a namespace called constructor gets its own", () => {
    const { i18n } = make({ locale: "en", messages: { en: {} }, onError() {} });
    const [a, b, c, d] = during(i18n, () => [
      useI18n("shop").T,
      useI18n("shop").T,
      useI18n("cart").T,
      useI18n("constructor").T,
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(typeof d).toBe("function");
    expect(d).not.toBe(Object);
  });
});

describe("t()", () => {
  it("is plain text: a handler's output is joined to one string", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { terms: "Read <link>the <b>new</b> terms</link>.", plain: "x" } },
      onError() {},
    });
    const t = during(i18n, () => useI18n().t) as (k: string, p?: object) => unknown;
    expect(t("terms", { link: (c: string) => `[${c}]` })).toBe("Read [the new terms].");
    expect(t("terms", { link: (c: string) => `[${c}]`, b: (c: string) => `*${c}*` })).toBe(
      "Read [the *new* terms].",
    );
    expect(t("plain")).toBe("x");
  });

  it("in a $derived on a namespace with no catalog: no state_unsafe_mutation (R4-17)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load, onError() {} });
    const w = mountWith(i18n, Derived, { ns: "shop" });
    flushSync();
    expect(w.text()).toBe("title");
    void i18n.load("shop");
    await settle();
    await l.answer("en:shop", { title: "Shop" });
    expect(w.text()).toBe("Shop");
  });
});
