/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26): `isReady`, `isFetching` (a load
 * in flight or expected) and `isLoading = !isReady && isFetching` (render a placeholder), each a
 * getter. Read together from one result, through a real instance, a loader the test answers,
 * `setI18n()` and a component's `useI18n()`.
 */
import { describe, expect, it } from "vitest";
import { createI18n, useI18n, type I18n, type UseI18n } from "../src";
import GateFirst from "./fixtures/GateFirst.svelte";
import ThreeWay from "./fixtures/ThreeWay.svelte";
import { make, manualLoader, mountWith, settle } from "./helpers";

/** Mounts a component calling `useI18n(ns)`; the reader returns the three flags at once. */
const capture = (i18n: I18n, ns?: string) => {
  let u!: UseI18n<string>;
  mountWith(i18n, () => void (u = useI18n(ns)));
  return () => [u.isReady, u.isLoading, u.isFetching];
};

/** `useI18n("shop")` with `en:shop` failed and nothing in flight (the unavailable state). */
const unavailableShop = async () => {
  const l = manualLoader({ "en:shop": { title: "Shop" }, "de:shop": { title: "Laden" } });
  const { i18n } = make({ locale: "en", messages: { en: {}, de: {} }, loader: l.load });
  const read = capture(i18n, "shop");
  await settle();
  await l.fail("en:shop");
  return { i18n, l, read };
};

describe("useI18n(): isReady, isLoading and isFetching in the same read", () => {
  it("useI18n() with a usable catalog and nothing loading → true, false, false", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { title: "Hello" } } });

    const read = capture(i18n);

    expect(read()).toEqual([true, false, false]);
  });

  it("useI18n() during a switch beside a usable catalog → true, false, true", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { title: "Hello" } }, loader: l.load });
    const read = capture(i18n);

    void i18n.setLocale("de");
    await settle();

    expect(read()).toEqual([true, false, true]);
  });

  it("useI18n(ns) with no usable catalog while it loads → false, true, true", () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });

    const read = capture(i18n, "shop");

    expect(read()).toEqual([false, true, true]);
  });

  it("useI18n(ns) after its load failed with nothing in flight → false, false, false", async () => {
    const { read } = await unavailableShop();

    expect(read()).toEqual([false, false, false]);
  });

  it("useI18n() with no catalog and no loader → false, false, false", () => {
    const { i18n } = make({ locale: "en" });

    const read = capture(i18n);

    expect(read()).toEqual([false, false, false]);
  });
});

describe("useI18n(ns): a retry and a switch with no usable catalog on screen", () => {
  it("i18n.load(ns) from unavailable → loading again, then ready once it loads", async () => {
    const { i18n, l, read } = await unavailableShop();
    void i18n.load("shop");
    await settle();
    const during = read();

    await l.answer("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([true, false, false]);
  });

  it("i18n.load(ns) from unavailable whose load fails again → loading, then unavailable", async () => {
    const { i18n, l, read } = await unavailableShop();
    void i18n.load("shop");
    await settle();
    const during = read();

    await l.fail("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });

  it("setLocale() while the namespace has no usable catalog → loading, then unavailable when it fails", async () => {
    const { i18n, l, read } = await unavailableShop();
    void i18n.setLocale("de");
    await settle();
    const during = read();

    await l.fail("de:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });
});

const mountTitle = (View: unknown) => {
  const l = manualLoader({ "de:default": { title: "Hallo" } });
  const { i18n } = make({ locale: "en", messages: { en: { title: "Hello" } }, loader: l.load });
  const log: string[] = [];
  const m = mountWith(i18n, View, { log });
  const node = (id: string) => m.target.querySelector(`[data-testid="${id}"]`);
  return { i18n, l, log, node };
};

describe.each([
  ["a three-way component (skeleton / unavailable / title)", ThreeWay],
  ["the boolean-first gate `{#if r.isLoading}` skeleton", GateFirst],
])("%s across setLocale()", (_, View) => {
  it("a switch whose catalog loads → the title on every update, never the skeleton, then the new text", async () => {
    const { i18n, l, log, node } = mountTitle(View);
    void i18n.setLocale("de");
    await settle();
    const inFlight = [...log];

    await l.answer("de:default");

    expect(inFlight).toEqual(["title:Hello", "title:Hello"]);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello", "title:Hallo"]);
    expect(node("title")?.textContent).toBe("Hallo");
  });

  it("a switch whose load fails with the old catalog on screen → stays ready with the old text", async () => {
    const { i18n, l, log, node } = mountTitle(View);
    let failed: unknown;
    void i18n.setLocale("de").then((e) => (failed = e));
    await settle();

    await l.fail("de:default");
    await settle();

    expect(failed).toBeInstanceOf(Error);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello"]);
    expect(node("title")?.textContent).toBe("Hello");
  });
});
