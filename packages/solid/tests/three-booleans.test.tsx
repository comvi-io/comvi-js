/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26): `isReady`, `isFetching` (a load
 * in flight or expected) and `isLoading = !isReady && isFetching` (render a placeholder), each an
 * accessor. Read together from one result, through a real instance, a loader the test answers,
 * the real provider and hook.
 */
import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { describe, expect, it } from "vitest";
import { createI18n, I18nProvider, useI18n, type I18n, type UseI18n } from "../src";
import { make, manualLoader, tick } from "./helpers";

/** Mounts a component calling `useI18n(ns)`; the reader returns the three flags at once. */
const capture = (i18n: I18n, ns?: string) => {
  let u!: UseI18n<string>;
  const C = () => {
    u = useI18n(ns);
    return null;
  };
  render(() => (
    <I18nProvider i18n={i18n}>
      <C />
    </I18nProvider>
  ));
  return () => [u.isReady(), u.isLoading(), u.isFetching()];
};

/** `useI18n("shop")` with `en:shop` failed and nothing in flight (the unavailable state). */
const unavailableShop = async () => {
  const l = manualLoader({ "en:shop": { title: "Shop" }, "de:shop": { title: "Laden" } });
  const { i18n } = make({ locale: "en", messages: { en: {}, de: {} }, loader: l.load });
  const read = capture(i18n, "shop");
  await tick();
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
    await tick();

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
    await tick();
    const during = read();

    await l.answer("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([true, false, false]);
  });

  it("i18n.load(ns) from unavailable whose load fails again → loading, then unavailable", async () => {
    const { i18n, l, read } = await unavailableShop();
    void i18n.load("shop").catch(() => {});
    await tick();
    const during = read();

    await l.fail("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });

  it("setLocale() while the namespace has no usable catalog → loading, then unavailable when it fails", async () => {
    const { i18n, l, read } = await unavailableShop();
    void i18n.setLocale("de").catch(() => {});
    await tick();
    const during = read();

    await l.fail("de:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });
});

/** Skeleton while loading, the title when ready, else an "unavailable" node; logs every update. */
const ThreeWay = (p: { log: string[] }) => {
  const { isReady, isLoading, t } = useI18n();
  const view = () => {
    if (isLoading()) return (p.log.push("skeleton"), (<i data-testid="skeleton" />));
    if (!isReady()) return (p.log.push("unavailable"), (<b data-testid="unavailable" />));
    const text = t("title") as string;
    return (p.log.push(`title:${text}`), (<h1 data-testid="title">{text}</h1>));
  };
  return <>{view()}</>;
};

/** The boolean-first gate: a skeleton while loading, else the title; logs every update. */
const GateFirst = (p: { log: string[] }) => {
  const { isLoading, t } = useI18n();
  const view = () => {
    if (isLoading()) return (p.log.push("skeleton"), (<i data-testid="skeleton" />));
    const text = t("title") as string;
    return (p.log.push(`title:${text}`), (<h1 data-testid="title">{text}</h1>));
  };
  return <>{view()}</>;
};

const mountTitle = (View: (p: { log: string[] }) => JSX.Element) => {
  const l = manualLoader({ "de:default": { title: "Hallo" } });
  const { i18n } = make({ locale: "en", messages: { en: { title: "Hello" } }, loader: l.load });
  const log: string[] = [];
  render(() => (
    <I18nProvider i18n={i18n}>
      <View log={log} />
    </I18nProvider>
  ));
  return { i18n, l, log };
};

describe.each([
  ["a three-way component (skeleton / unavailable / title)", ThreeWay],
  ["the boolean-first gate `if (isLoading()) return <Skeleton />`", GateFirst],
])("%s across setLocale()", (_, View) => {
  it("a switch whose catalog loads → the title on every update, never the skeleton, then the new text", async () => {
    const { i18n, l, log } = mountTitle(View);
    void i18n.setLocale("de");
    await tick();
    const inFlight = [...log];

    await l.answer("de:default");

    expect(inFlight).toEqual(["title:Hello", "title:Hello"]);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello", "title:Hallo"]);
    expect(screen.getByTestId("title").textContent).toBe("Hallo");
  });

  it("a switch whose load fails with the old catalog on screen → stays ready with the old text", async () => {
    const { i18n, l, log } = mountTitle(View);
    let failed: unknown;
    void i18n.setLocale("de").catch((e) => (failed = e));
    await tick();

    await l.fail("de:default");
    await tick();

    expect(failed).toBeInstanceOf(Error);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello"]);
    expect(screen.getByTestId("title").textContent).toBe("Hello");
  });
});
