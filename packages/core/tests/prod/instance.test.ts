/**
 * The instance in the production project (`__DEV__` false): the same rendering and the
 * same codes as development, no development text, and the default reporter silent.
 */
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../../src/errors";
import { formatNumber } from "../../src/format";
import { createI18n, type I18n } from "../../src/instance";
import { core } from "../../src/internal";

declare const __VERSION__: string;

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

  it("flattens nested groups and reports a collision or an invalid leaf, without a message, printing nothing (lot 6a)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { nav: { home: "x" }, "nav.home": "y", n: 5 } as never },
      onError: (e) => errors.push(e),
    });
    expect(i18n.t("nav.home")).toBe("x");
    expect(errors.map((e) => [e.code, e.key, e.message])).toEqual([
      ["syntax", "nav.home", undefined],
      ["syntax", "n", undefined],
    ]);
    // Without onError the default reporter is silent in production.
    createI18n({ locale: "en", messages: { en: { nav: { home: "x" }, n: 5 } as never } });
    i18n.t("missing");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("without onError a missing key does no reporting work (counted, lot 1d)", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { a: "A" } },
      loader: () => new Promise(() => {}),
      namespaces: ["default", "other"],
    });
    // A load in flight: the "still loading?" scan of the loads would run if anything listened.
    expect(i18n.ns("other")("x")).toBe("x");
    const some = vi.spyOn(Array.prototype, "some");
    const ends = vi.spyOn(String.prototype, "endsWith");
    for (let k = 0; k < 10; k++) i18n.t("nope");
    expect([some.mock.calls.length, ends.mock.calls.length]).toEqual([0, 0]);
    some.mockRestore();
    ends.mockRestore();
  });
});

describe("production catalog values", () => {
  it("are not checked: a nested object reports nothing, even to onError", () => {
    const errors: I18nError[] = [];
    createI18n({
      locale: "en",
      messages: { en: { nav: { home: "x" } } as never },
      onError: (e) => errors.push(e),
    });
    expect(errors).toEqual([]);
  });
});

describe("production createI18n (lot 4d)", () => {
  it("an invalid start locale is a RangeError naming the tag only", () => {
    expect(() => createI18n({ locale: "!!" })).toThrow(RangeError);
    expect(() => createI18n({ locale: "!!" })).toThrow(/^!!$/);
  });
});

describe("production formatters (lot 4d)", () => {
  it("something that is not an instance is a TypeError, without development text", () => {
    expect(() => formatNumber({} as I18n, 1)).toThrow(TypeError);
    expect(() => formatNumber({} as I18n, 1)).not.toThrow(/comvi/);
  });

  it("an explicit locale that is not a tag is a RangeError naming the tag only", () => {
    const i18n = createI18n({ locale: "en" });
    expect(() => formatNumber(i18n, 1, undefined, "!!")).toThrow(RangeError);
    expect(() => formatNumber(i18n, 1, undefined, "!!")).toThrow(/^!!$/);
  });
});

describe("production: an instance of another copy of the core (B3)", () => {
  it.each([
    ["another version", "0.0.0-other"],
    ["the same version", __VERSION__],
  ])("core() of an instance at %s → the short error, both versions in it", (_, made) => {
    const i18n = { [Symbol.for("comvi")]: made } as unknown as I18n;

    const read = () => core(i18n);

    expect(read).toThrow(new Error(`two copies of @comvi/core: ${made}, ${__VERSION__}`));
  });

  it.each([
    ["an untagged 0.7-style instance", { locale: "en", t: () => "", on: () => () => {} }],
    ["a plain object", {}],
    ["undefined", undefined],
  ])("core() of %s → the short error with an unknown version, never undefined", (_, value) => {
    const read = () => core(value as unknown as I18n);

    expect(read).toThrow(new Error(`two copies of @comvi/core: undefined, ${__VERSION__}`));
  });
});
