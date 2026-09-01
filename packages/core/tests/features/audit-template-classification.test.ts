import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";

describe("template classification", () => {
  it("renders the selected branch of a select that follows a plain param", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { line: "{name} {gender, select, male {he} other {they}}" } });

    const result = i18n.t("line", { name: "Ada", gender: "male" });

    expect(result).toBe("Ada he");
  });
});
