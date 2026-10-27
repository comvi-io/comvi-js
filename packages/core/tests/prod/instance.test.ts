/**
 * The instance in the production project (`__DEV__` false): the same rendering and the
 * same codes as development, no development text, the catalog-value check left out, and
 * the default reporter silent.
 */
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n } from "../../src/instance";

describe("production instance", () => {
  it("renders and reports exactly like development, without messages", async () => {
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      messages: { de: { p: "{x}" }, en: { a: "A", n: "{n, plural, other {# x}}" } },
      onError: (e) => errors.push(e),
    });
    expect([i18n.t("a"), i18n.t("p"), i18n.t("nope"), i18n.t("n", { n: 1234 })]).toEqual([
      "A",
      "{x}",
      "nope",
      "1,234 x", // a fallback message formats for the locale it was written in
    ]);
    await expect(i18n.setLocale("!!")).rejects.toThrow(RangeError);
    expect(errors.map((e) => [e.code, e.message])).toEqual([
      ["fallback_used", undefined],
      ["missing_param", undefined],
      ["missing_key", undefined],
      ["fallback_used", undefined],
      ["invalid_locale", undefined],
    ]);
  });

  it("does not check catalog values (a development-only check) and prints nothing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", messages: { en: { nav: { home: "x" } } as never } });
    expect(i18n.t("nav")).toBe("nav");
    i18n.t("missing");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
