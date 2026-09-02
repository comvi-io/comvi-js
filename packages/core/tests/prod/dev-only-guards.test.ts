/**
 * Guards the production build DROPS, and the one it keeps.
 *
 * Catalog shape: the top-level `translation` option is validated in both
 * builds — a wrong type there is a programming error the host cannot recover
 * from — while the per-locale walk that inspects every entry is development
 * guidance and is folded out, so a malformed locale catalog is stored as given
 * rather than rejected.
 *
 * Missing parameters: the once-per-(template, param) warn dedup exists only to
 * keep the dev console readable, so production carries neither the bookkeeping
 * set nor the branch that reads it — while the literal rendering it accompanies
 * is the shipped behaviour and stays.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("catalog shape validation", () => {
  it("throws the bare E_TRANSLATION_NOT_OBJECT code when `translation` is not an object", () => {
    expect(() =>
      createI18n({ locale: "en", exposeGlobal: false, translation: "nope" as never }),
    ).toThrowError(expect.objectContaining({ message: "E_TRANSLATION_NOT_OBJECT" }));
  });

  it("accepts a malformed locale catalog — the per-entry walk is development-only", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: "hi" as never },
    });

    // Stored as given: `Object.assign` over a string spreads its characters, so
    // the un-renderable catalog surfaces at lookup instead of at construction.
    expect(i18n.t("0")).toBe("h");
  });
});

describe("missing parameters", () => {
  it("renders a missing parameter literally without consulting the dev warn-dedup set", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: "Hi, {name}!" } },
    });

    expect(i18n.t("greet")).toBe("Hi, {name}!");

    expect(spy).not.toHaveBeenCalled();
  });

  it("renders the same literal on every repeat, having nothing to deduplicate", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { repeat: "Bye, {name}!" } },
    });

    expect([i18n.t("repeat"), i18n.t("repeat")]).toEqual(["Bye, {name}!", "Bye, {name}!"]);
  });
});
