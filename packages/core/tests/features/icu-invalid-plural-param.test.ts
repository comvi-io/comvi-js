import { describe, expect, it, vi } from "vitest";
import { I18n } from "../helpers/composedHost";

const PLURAL = "{count, plural, one {# apple} other {# apples}}";
const ORDINAL = "{count, selectordinal, one {#st} other {#th}}";

function makeInstance(template: string) {
  const i18n = new I18n({ locale: "en" });
  i18n.addTranslations({ en: { k: template } });
  return i18n;
}

describe("a plural whose parameter is not a number", () => {
  it("renders the plural argument back verbatim", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeInstance(PLURAL);

    expect(i18n.t("k", { count: "abc" })).toBe(PLURAL);
  });

  it("renders a selectordinal argument back with its own type", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeInstance(ORDINAL);

    expect(i18n.t("k", { count: "abc" })).toBe(ORDINAL);
  });

  it("warns with the parameter name, the expected type and the value received", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeInstance(PLURAL);

    i18n.t("k", { count: "abc" });

    expect(warnSpy).toHaveBeenCalledWith(
      '[i18n] Invalid plural parameter value for "count": expected number, got string',
      { param: "count", value: "abc" },
    );
  });
});
