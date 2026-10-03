/**
 * F-17 — the bound formatters read the locale signal. On the server that
 * signal is seeded from the host (or `ssrLocale`), so `renderToString` must
 * paint the same text a plain call to the core formatter would.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

const host = () => createI18n({ locale: "en", translation: { en: {} }, exposeGlobal: false });

const renderPrice = async (ssrLocale?: string) =>
  (await import("./formatters.server")).renderPrice(host(), ssrLocale);

const eur = (locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(1234.5);

describe("solid SSR — bound formatters", () => {
  it("formats in the host locale", async () => {
    expect(await renderPrice()).toContain(eur("en"));
  });

  it("formats in the seeded ssrLocale", async () => {
    const html = await renderPrice("de");
    expect(html).toContain(eur("de"));
    expect(html).not.toContain(eur("en"));
  });
});
