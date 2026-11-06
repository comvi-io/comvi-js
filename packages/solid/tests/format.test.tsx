/**
 * @comvi/solid/format — useFormat() (design §3.3): the core formatters over the REAL instance
 * and the locale slice read at the call, so a memo or a JSX expression re-runs on a switch and
 * only then (owner brief 31.10: no getter object, no wrapper, no cast).
 */
import { createEffect, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { formatNumber } from "@comvi/core/format";
import { createI18n, I18nProvider, type I18n } from "../src";
import { useFormat, type Formatters } from "../src/format";
import { make, manualLoader } from "./helpers";

const capture = (i18n: I18n) => {
  let f!: Formatters;
  const C = () => ((f = useFormat()), null);
  render(() => (
    <I18nProvider i18n={i18n}>
      <C />
    </I18nProvider>
  ));
  return f;
};
// Intl spaces are narrow / no-break spaces.
const sp = (s: string | undefined) => s!.replace(/[\u00a0\u202f]/g, " ");

describe("useFormat()", () => {
  it("formats numbers, currency, dates, ranges, lists, names and relative time in the locale", () => {
    const i18n = createI18n({
      locale: "de",
      timeZone: "UTC",
      now: Date.UTC(2026, 0, 10),
      formats: { number: { pct: { style: "percent" } } },
    });
    const f = capture(i18n);
    expect(sp(f.number(1234.5))).toBe("1.234,5");
    expect(sp(f.number(0.5, "pct"))).toBe("50 %");
    expect(sp(f.currency(9.5, "EUR"))).toBe("9,50 €");
    expect(sp(f.date(Date.UTC(2026, 0, 2), { dateStyle: "medium" }))).toBe("02.01.2026");
    expect(
      sp(
        f.dateRange(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5), {
          day: "numeric",
          month: "numeric",
        }),
      ),
    ).toBe("02.–05.01.");
    expect(f.list(["a", "b", "c"])).toBe("a, b und c");
    expect(f.displayName("en")).toBe("Englisch");
    expect(f.relative(Date.UTC(2026, 0, 9))).toBe("gestern");
    expect(f.relative(Date.UTC(2026, 0, 3), { now: Date.UTC(2026, 0, 5), numeric: "always" })).toBe(
      "vor 2 Tagen",
    );
  });

  it("the core formatters refuse anything but a real instance: a getter object is a TypeError", () => {
    expect(() => formatNumber({ locale: "de" } as never, 1)).toThrow(TypeError);
    // So this binding passes the real one: it formats, with the instance's own options.
    const i18n = createI18n({ locale: "en", formats: { number: { pct: { style: "percent" } } } });
    expect(capture(i18n).number(0.5, "pct")).toBe("50%");
  });

  it("JSX that formats re-renders on a switch", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const C = () => <p>{useFormat().number(1234.5)}</p>;
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    expect(container.textContent).toBe("1,234.5");
    await i18n.setLocale("de");
    expect(container.textContent).toBe("1.234,5");
  });

  it("re-runs on a locale switch only: a namespace load does not (counted)", async () => {
    const l = manualLoader({ "en:shop": {}, "de:default": {} });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let runs = 0;
    let last = "";
    const C = () => {
      const fmt = useFormat();
      createEffect(() => ((last = fmt.number(1234.5)), runs++));
      return null;
    };
    render(() => (
      <I18nProvider i18n={i18n}>
        <C />
      </I18nProvider>
    ));
    void i18n.load("shop");
    await l.answer("en:shop");
    expect(runs).toBe(1);
    const sw = i18n.setLocale("de");
    expect(runs).toBe(1);
    await l.answer("de:default");
    await sw;
    expect(runs).toBe(2);
    expect(last).toBe("1.234,5");
  });

  it("walks the configured fallback chain when the runtime lacks the locale, like the core", () => {
    const i18n = createI18n({ locale: "xx", fallbackLocale: "de", messages: { xx: {} } });
    expect(capture(i18n).number(1234.5)).toBe(new Intl.NumberFormat("de").format(1234.5));
  });

  it("createI18n with an invalid start locale throws a RangeError", () => {
    expect(() => createI18n({ locale: "!!" })).toThrow(RangeError);
  });

  it("an explicit `now` option stays fixed", () => {
    const i18n = createI18n({ locale: "en", now: 940_000, serverNow: 100 });
    expect(capture(i18n).relative(880_000)).toBe("1 minute ago");
  });

  it("a component rendered outside a hydration counts from the browser's clock at once, whatever the handed-over serverNow", () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });
    try {
      const i18n = createI18n({ locale: "en", serverNow: 940_000 });
      const [n] = createSignal(0);
      const C = () => {
        const f = useFormat();
        return <p>{(n(), f.relative(880_000))}</p>;
      };
      const { container } = render(() => (
        <I18nProvider i18n={i18n}>
          <C />
        </I18nProvider>
      ));
      expect(container.textContent).toBe("2 minutes ago");
    } finally {
      vi.useRealTimers();
    }
  });
});
