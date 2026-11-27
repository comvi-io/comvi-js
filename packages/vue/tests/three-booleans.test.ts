/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26): `isReady`, `isFetching` (a load
 * in flight or expected) and `isLoading = !isReady && isFetching` (render a placeholder), each a
 * computed ref. Read together from one result, through a real instance, a loader the test
 * answers, the installed plugin and a component's `useI18n()`.
 */
import { defineComponent, h, type Component } from "vue";
import { describe, expect, it } from "vitest";
import { createI18n, useI18n, type UseI18n, type VueI18n } from "../src";
import { make, manualLoader, mountWith, settle } from "./helpers";

/** Mounts a component calling `useI18n(ns)`; the reader returns the three flags at once. */
const capture = (i18n: VueI18n, ns?: string) => {
  let u!: UseI18n<string>;
  const C = defineComponent({
    setup() {
      u = useI18n(ns);
      return () => null;
    },
  });
  mountWith(i18n, C);
  return () => [u.isReady.value, u.isLoading.value, u.isFetching.value];
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

/** Skeleton while loading, the title when ready, else an "unavailable" node; logs every render. */
const threeWay = (log: string[]) =>
  defineComponent({
    setup() {
      const { isReady, isLoading, t } = useI18n();
      return () => {
        if (isLoading.value) return (log.push("skeleton"), h("i", { "data-testid": "skeleton" }));
        if (!isReady.value)
          return (log.push("unavailable"), h("b", { "data-testid": "unavailable" }));
        log.push(`title:${t("title")}`);
        return h("h1", { "data-testid": "title" }, t("title"));
      };
    },
  });

/** The boolean-first gate: a skeleton while loading, else the title; logs every render. */
const gateFirst = (log: string[]) =>
  defineComponent({
    setup() {
      const { isLoading, t } = useI18n();
      return () => {
        if (isLoading.value) return (log.push("skeleton"), h("i", { "data-testid": "skeleton" }));
        log.push(`title:${t("title")}`);
        return h("h1", { "data-testid": "title" }, t("title"));
      };
    },
  });

const mountTitle = (view: (log: string[]) => Component) => {
  const l = manualLoader({ "de:default": { title: "Hallo" } });
  const { i18n } = make({ locale: "en", messages: { en: { title: "Hello" } }, loader: l.load });
  const log: string[] = [];
  const w = mountWith(i18n, view(log));
  return { i18n, l, log, w };
};

describe.each([
  ["a three-way component (skeleton / unavailable / title)", threeWay],
  ['the boolean-first gate `v-if="isLoading"` skeleton', gateFirst],
])("%s across setLocale()", (_, view) => {
  it("a switch whose catalog loads → the title on every render, never the skeleton, then the new text", async () => {
    const { i18n, l, log, w } = mountTitle(view);
    void i18n.setLocale("de");
    await settle();
    const inFlight = [...log];

    await l.answer("de:default");

    expect(inFlight).toEqual(["title:Hello", "title:Hello"]);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello", "title:Hallo"]);
    expect(w.get('[data-testid="title"]').text()).toBe("Hallo");
  });

  it("a switch whose load fails with the old catalog on screen → stays ready with the old text", async () => {
    const { i18n, l, log, w } = mountTitle(view);
    let failed: unknown;
    void i18n.setLocale("de").then((e) => (failed = e));
    await settle();

    await l.fail("de:default");
    await settle();

    expect(failed).toBeInstanceOf(Error);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello"]);
    expect(w.get('[data-testid="title"]').text()).toBe("Hello");
  });
});
