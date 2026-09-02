/**
 * `defaultParams` validation in a PRODUCTION build: the guards stay — a
 * malformed default is rejected in both builds — and only the wording is
 * traded for a bare `E_*` code.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

describe("defaultParams validation", () => {
  it("throws the bare E_RESERVED_DEFAULT_PARAMS code for a call-control key", () => {
    expect(() =>
      createI18n({ locale: "en", exposeGlobal: false, defaultParams: { ns: "x" } as never }),
    ).toThrowError(expect.objectContaining({ message: "E_RESERVED_DEFAULT_PARAMS" }));
  });

  it("throws the bare E_NULLISH_DEFAULT_PARAMS code for a null value", () => {
    expect(() =>
      createI18n({ locale: "en", exposeGlobal: false, defaultParams: { name: null } as never }),
    ).toThrowError(expect.objectContaining({ message: "E_NULLISH_DEFAULT_PARAMS" }));
  });
});

describe("setDefaultParams()", () => {
  it("throws the bare E_DEFAULT_PARAMS_GUARANTEED_KEY code when a constructor key is dropped", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      defaultParams: { formality: "formal" },
    });

    expect(() => i18n.setDefaultParams({} as never)).toThrowError(
      expect.objectContaining({ message: "E_DEFAULT_PARAMS_GUARANTEED_KEY" }),
    );
  });

  it("accepts a replacement that preserves every constructor-guaranteed key", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      defaultParams: { formality: "formal" },
      translation: { en: { greeting: "Hi, {formality}!" } },
    });

    i18n.setDefaultParams({ formality: "informal" });

    expect(i18n.t("greeting")).toBe("Hi, informal!");
  });
});
