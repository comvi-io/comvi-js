/**
 * @comvi/react/format — useFormat() (design §3.3). Ported by meaning from 0.7
 * useFormatters.test.tsx and the formatter cases of useI18n.test.tsx: formatters bound to
 * the render locale, re-rendering on a switch, the instance's timeZone, named formats,
 * rtl and relative time; a handover locale formats in the target.
 */
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createI18n, I18nHandover, I18nProvider, type I18n } from "../src";
import { useFormat, type Formatters } from "../src/format";

const capture = (i18n: I18n, wrap = (x: React.ReactNode) => x) => {
  const seen: Formatters[] = [];
  const Probe = () => {
    seen.push(useFormat());
    return null;
  };
  render(<I18nProvider i18n={i18n}>{wrap(<Probe />)}</I18nProvider>);
  return () => seen[seen.length - 1];
};

describe("useFormat()", () => {
  it("formats numbers, currency, dates, ranges, lists, names and relative time in the locale", () => {
    const i18n = createI18n({
      locale: "de",
      timeZone: "UTC",
      now: Date.UTC(2026, 0, 10),
      formats: { number: { pct: { style: "percent" } } },
    });
    const raw = capture(i18n)();
    // Intl spaces are narrow / no-break spaces.
    const sp = (s: string | undefined) => s!.replace(/[\u00a0\u202f]/g, " ");
    const f = Object.fromEntries(
      Object.entries(raw).map(([k, fn]) => [
        k,
        (...a: never[]) => sp((fn as (...x: never[]) => string)(...a)),
      ]),
    ) as unknown as Formatters;
    expect(f.number(1234.5)).toBe("1.234,5");
    expect(f.number(0.5, "pct")).toBe("50 %");
    expect(f.currency(9.5, "EUR")).toBe("9,50 €");
    expect(f.date(Date.UTC(2026, 0, 2), { dateStyle: "medium" })).toBe("02.01.2026");
    expect(
      f.dateRange(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5), { day: "numeric", month: "numeric" }),
    ).toBe("02.–05.01.");
    expect(f.list(["a", "b", "c"])).toBe("a, b und c");
    expect(f.displayName("en")).toBe("Englisch");
    expect(f.relative(Date.UTC(2026, 0, 9))).toBe("gestern");
    // `now` and Intl's options in one object, like every other formatter (lot 4b).
    expect(f.relative(Date.UTC(2026, 0, 3), { now: Date.UTC(2026, 0, 5), numeric: "always" })).toBe(
      "vor 2 Tagen",
    );
  });

  it("a handed-over serverNow holds for the hydration render, the browser clock after mount (lot 4b)", () => {
    const real = Date.now;
    Date.now = () => 1_000_000;
    try {
      // The server rendered at 940 000: "1 minute ago" for 880 000 then.
      const i18n = createI18n({ locale: "en", timeZone: "UTC", serverNow: 940_000 });
      const seen: string[] = [];
      const Ago = () => {
        const f = useFormat();
        seen.push(f.relative(880_000));
        return null;
      };
      const { rerender } = render(
        <I18nProvider i18n={i18n}>
          <Ago />
        </I18nProvider>,
      );
      rerender(
        <I18nProvider i18n={i18n}>
          <Ago />
        </I18nProvider>,
      );
      expect(seen[0]).toBe("1 minute ago"); // what the server rendered
      expect(seen.at(-1)).toBe("2 minutes ago"); // after mount: the browser's clock
    } finally {
      Date.now = real;
    }
  });

  it("re-renders with new formatters on a locale switch", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const f = capture(i18n);
    expect(f().number(1234.5)).toBe("1,234.5");
    await act(() => i18n.setLocale("de"));
    expect(f().number(1234.5)).toBe("1.234,5");
  });

  it("a formatter kept from an earlier render keeps that render's locale, like its t", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const f = capture(i18n);
    const kept = f();
    await act(() => i18n.setLocale("de"));
    expect(kept.number(1234.5)).toBe("1,234.5");
    expect(f().number(1234.5)).toBe("1.234,5");
  });

  it("formats in the target locale of an <I18nHandover> before the instance switches", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } });
    const f = capture(i18n, (x) => <I18nHandover locale="de">{x}</I18nHandover>);
    expect(f().number(1234.5)).toBe("1.234,5");
  });
});
