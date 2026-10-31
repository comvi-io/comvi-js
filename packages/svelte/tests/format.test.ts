/**
 * `useFormat()`: the core's formatters with the REAL instance and the locale read reactively
 * (brief: no getter object, no cast). A binding that passes anything else fails on the core's
 * TypeError, and a switch re-renders what formats.
 */
import { formatNumber } from "@comvi/core/format";
import { describe, expect, it } from "vitest";
import { useFormat } from "../src/format.svelte";
import Format from "./fixtures/Format.svelte";
import { make, mountWith, settle } from "./helpers";

type F = ReturnType<typeof useFormat>;
const DAY = 86_400_000;
const show = (i18n: Parameters<typeof mountWith>[0], run: (f: F) => unknown) =>
  mountWith(i18n, Format, { run });
const de = { locale: "en", timeZone: "UTC", messages: { en: {}, de: {} } };

describe("useFormat()", () => {
  it("formats in the locale", () => {
    const { i18n } = make({ ...de, locale: "de" });
    const at = Date.UTC(2026, 0, 2);
    expect(show(i18n, (f) => f.number(1234.5)).text()).toBe("1.234,5");
    expect(show(i18n, (f) => f.currency(9.5, "EUR")).text()).toContain("9,50");
    expect(show(i18n, (f) => f.date(at, { dateStyle: "short" })).text()).toBe("02.01.26");
    expect(show(i18n, (f) => f.dateRange(at, at + DAY, { month: "short" })).text()).toContain(
      "Jan",
    );
    expect(show(i18n, (f) => f.list(["a", "b"])).text()).toBe("a und b");
    expect(show(i18n, (f) => f.displayName("en", "language")).text()).toBe("Englisch");
    expect(show(i18n, (f) => f.relative(at - DAY, { now: at })).text()).toBe("gestern");
  });

  it("the core refuses anything but a real instance: a getter object is a TypeError", () => {
    expect(() => formatNumber({ locale: "de" } as never, 1)).toThrow(TypeError);
    const { i18n } = make(de);
    expect(() => show(i18n, (f) => f.number(1))).not.toThrow();
  });

  it("re-renders on setLocale()", async () => {
    const { i18n } = make(de);
    const w = show(i18n, (f) => f.number(1234.5));
    expect(w.text()).toBe("1,234.5");
    await i18n.setLocale("de");
    await settle();
    expect(w.text()).toBe("1.234,5");
  });

  it("a handed-over serverNow holds until the mount, then the clock is the browser's", async () => {
    const serverNow = Date.UTC(2020, 0, 2);
    const { i18n } = make({ ...de, serverNow } as never);
    const seen: unknown[] = [];
    const w = show(i18n, (f) => {
      const s = f.relative(serverNow - DAY);
      seen.push(s);
      return s;
    });
    await settle();
    expect(seen[0]).toBe("yesterday");
    expect(w.text()).not.toBe("yesterday");
    expect(w.text()).toMatch(/years? ago/);
  });

  it("an explicit `now` option stays fixed", async () => {
    const now = Date.UTC(2020, 0, 2);
    const { i18n } = make(de);
    const w = show(i18n, (f) => f.relative(now - DAY, { now }));
    await settle();
    expect(w.text()).toBe("yesterday");
  });
});
