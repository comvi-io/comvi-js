import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";

const FORMALITY_SELECT = "{formality, select, formal {Ihre Bewertung} other {Deine Bewertung}}";

function createInstance() {
  const i18n = new I18n({ locale: "de", defaultParams: { formality: "formal" } });
  i18n.addTranslations({ de: { review: FORMALITY_SELECT } });
  return i18n;
}

describe("setDefaultParams() guaranteed-key nullish check", () => {
  // Pins the `params[key] == null` arm of assertPreservesDefaultParamKeys. The
  // earlier assertInterpolationDefaults pass only walks Object.keys (own
  // ENUMERABLE), so a non-enumerable own key reaches this check and nothing else.
  it("rejects a non-enumerable own guaranteed key whose value is null", () => {
    const i18n = createInstance();
    const params = {};
    Object.defineProperty(params, "formality", { value: null, enumerable: false });

    expect(() => i18n.setDefaultParams(params as never)).toThrow(/formality/);

    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("rejects a non-enumerable own guaranteed key whose value is undefined", () => {
    const i18n = createInstance();
    const params = {};
    Object.defineProperty(params, "formality", { value: undefined, enumerable: false });

    expect(() => i18n.setDefaultParams(params as never)).toThrow(/formality/);

    expect(i18n.t("review")).toBe("Ihre Bewertung");
  });

  it("accepts a non-enumerable own guaranteed key that carries a real value", () => {
    const i18n = createInstance();
    const params = {};
    Object.defineProperty(params, "formality", { value: "informal", enumerable: false });

    i18n.setDefaultParams(params as never);

    expect(i18n.t("review")).toBe("Deine Bewertung");
  });
});
