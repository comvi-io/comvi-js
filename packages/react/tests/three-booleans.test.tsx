/**
 * The three booleans of `useI18n()` (owner decision 2026-11-26): `isReady`, `isFetching` (a load
 * in flight or expected) and `isLoading = !isReady && isFetching` (render a placeholder). Read
 * together from one result, through a real instance, a loader the test answers, the real
 * provider and hook.
 */
import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createI18n, I18nProvider, useI18n, type I18n, type UseI18n } from "../src";
import { make, manualLoader, settle } from "./helpers";

/** Renders a probe of `useI18n(ns)` under `i18n`; the reader returns the latest render's flags. */
const capture = (i18n: I18n, ns?: string) => {
  const seen: UseI18n<string>[] = [];
  const Probe = () => {
    seen.push(useI18n(ns));
    return null;
  };
  render(
    <I18nProvider i18n={i18n}>
      <Probe />
    </I18nProvider>,
  );
  return () => {
    const u = seen[seen.length - 1];
    return [u.isReady, u.isLoading, u.isFetching];
  };
};

/** `useI18n("shop")` with `en:shop` failed and nothing in flight (the unavailable state). */
const unavailableShop = async () => {
  const l = manualLoader({ "en:shop": { title: "Shop" }, "de:shop": { title: "Laden" } });
  const { i18n } = make({ locale: "en", messages: { en: {}, de: {} }, loader: l.load });
  const read = capture(i18n, "shop");
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

    await act(async () => void i18n.setLocale("de"));

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
    await act(async () => void i18n.load("shop"));
    const during = read();

    await l.answer("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([true, false, false]);
  });

  it("i18n.load(ns) from unavailable whose load fails again → loading, then unavailable", async () => {
    const { i18n, l, read } = await unavailableShop();
    await act(async () => void i18n.load("shop").catch(() => {}));
    const during = read();

    await l.fail("en:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });

  it("setLocale() while the namespace has no usable catalog → loading, then unavailable when it fails", async () => {
    const { i18n, l, read } = await unavailableShop();
    await act(async () => void i18n.setLocale("de").catch(() => {}));
    const during = read();

    await l.fail("de:shop");

    expect(during).toEqual([false, true, true]);
    expect(read()).toEqual([false, false, false]);
  });
});

/** Skeleton while loading, the title when ready, else an "unavailable" node; logs every render. */
const ThreeWay = ({ log }: { log: string[] }) => {
  const { isReady, isLoading, t } = useI18n();
  if (isLoading) return (log.push("skeleton"), (<i data-testid="skeleton" />));
  if (!isReady) return (log.push("unavailable"), (<b data-testid="unavailable" />));
  const text = t("title") as string;
  log.push(`title:${text}`);
  return <h1 data-testid="title">{text}</h1>;
};

/** The boolean-first gate: a skeleton while loading, else the title; logs every render. */
const GateFirst = ({ log }: { log: string[] }) => {
  const { isLoading, t } = useI18n();
  if (isLoading) return (log.push("skeleton"), (<i data-testid="skeleton" />));
  const text = t("title") as string;
  log.push(`title:${text}`);
  return <h1 data-testid="title">{text}</h1>;
};

const mountTitle = (View: (p: { log: string[] }) => ReactNode) => {
  const l = manualLoader({ "de:default": { title: "Hallo" } });
  const { i18n } = make({ locale: "en", messages: { en: { title: "Hello" } }, loader: l.load });
  const log: string[] = [];
  render(
    <I18nProvider i18n={i18n}>
      <View log={log} />
    </I18nProvider>,
  );
  return { i18n, l, log };
};

describe.each([
  ["a three-way component (skeleton / unavailable / title)", ThreeWay],
  ["the boolean-first gate `if (isLoading) return <Skeleton />`", GateFirst],
])("%s across setLocale()", (_, View) => {
  it("a switch whose catalog loads → the title on every render, never the skeleton, then the new text", async () => {
    const { i18n, l, log } = mountTitle(View);
    await act(async () => void i18n.setLocale("de"));
    const inFlight = [...log];

    await l.answer("de:default");

    expect(inFlight).toEqual(["title:Hello", "title:Hello"]);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello", "title:Hallo"]);
    expect(screen.getByTestId("title").textContent).toBe("Hallo");
  });

  it("a switch whose load fails with the old catalog on screen → stays ready with the old text", async () => {
    const { i18n, l, log } = mountTitle(View);
    let failed: unknown;
    await act(async () => void i18n.setLocale("de").catch((e) => (failed = e)));

    await l.fail("de:default");
    await settle();

    expect(failed).toBeInstanceOf(Error);
    expect(log).toEqual(["title:Hello", "title:Hello", "title:Hello"]);
    expect(screen.getByTestId("title").textContent).toBe("Hello");
  });
});
