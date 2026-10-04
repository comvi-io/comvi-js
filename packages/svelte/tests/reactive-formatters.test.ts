/**
 * F-18: the formatters `useI18n()` hands back are plain functions, and a
 * Svelte 5 template expression or `$derived` that calls one must re-run on a
 * locale switch without the caller adding `$locale` to it, as `$t` does. A
 * trailing explicit locale still wins over the active one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { createI18n } from "../src/index";
import ReactiveFormattersHarness from "./ReactiveFormattersHarness.test.svelte";

const day = new Date(Date.UTC(2024, 0, 2));
const dateOptions = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;

const eur = (locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(1234.5);
const longDate = (locale: string) => new Intl.DateTimeFormat(locale, dateOptions).format(day);

const makeI18n = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: {}, de: {}, ar: {} },
  });

let component: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent;

describe("useI18n formatters follow the locale (F-18)", () => {
  it("a template expression calling formatCurrency re-renders on setLocale", async () => {
    const i18n = makeI18n();
    component = mount(ReactiveFormattersHarness, { target: document.body, props: { i18n } });
    await tick();
    expect(text("currency")).toBe("€1,234.50");

    await i18n.setLocale("de");
    await tick();
    expect(text("currency")).toBe(eur("de"));
    expect(text("currency")).toBe("1.234,50 €");
  });

  it("a $derived calling formatDate re-runs on setLocale", async () => {
    const i18n = makeI18n();
    component = mount(ReactiveFormattersHarness, { target: document.body, props: { i18n } });
    await tick();
    expect(text("date")).toBe(longDate("en"));

    await i18n.setLocale("de");
    await tick();
    expect(text("date")).toBe(longDate("de"));
  });

  it("a trailing explicit locale overrides all four and survives a switch to ar", async () => {
    const i18n = makeI18n();
    component = mount(ReactiveFormattersHarness, { target: document.body, props: { i18n } });
    await tick();

    const expected = {
      "pinned-number": new Intl.NumberFormat("en").format(1234.5),
      "pinned-date": longDate("en"),
      "pinned-currency": eur("en"),
      "pinned-relative": new Intl.RelativeTimeFormat("en").format(-2, "day"),
    };
    for (const [id, value] of Object.entries(expected)) expect(text(id)).toBe(value);

    await i18n.setLocale("ar");
    await tick();
    // The active locale did move: the unpinned currency is Arabic now.
    expect(text("currency")).toBe(eur("ar"));
    for (const [id, value] of Object.entries(expected)) expect(text(id)).toBe(value);
  });
});
