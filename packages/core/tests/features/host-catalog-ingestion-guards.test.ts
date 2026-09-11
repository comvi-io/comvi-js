import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("addTranslations() on a non-flat catalog (C1)", () => {
  // This block used to assert the opposite: a dev warning naming the offending
  // key and telling the reader the base host "stores catalogs as given". The
  // rule it softened is gone — the base flattens unconditionally — so the
  // warning must be gone with it.
  it("flattens instead of warning, with no mention of flattenCatalog", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.addTranslations({ en: { nav: { home: "Home" } } as never });

    expect(i18n.t("nav.home" as never)).toBe("Home");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops a null leaf with the flattener's own warning, as the loader path does", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.addTranslations({ en: { total: null } as never });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Dropping translation "total"'));
    expect(i18n.hasTranslation("total")).toBe(false);
  });

  it("coerces a non-string leaf with the flattener's own warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.addTranslations({ en: { total: 3 } as never });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Translation "total" is not a string'),
    );
    expect(i18n.t("total" as never)).toBe("3");
  });
});

describe("addTranslations() ICU preflight on the base host", () => {
  // `'#` is a quote only inside a plural sub-message; at the top level it is
  // two literal characters, so the ICU segment behind it must still be seen.
  it("still rejects an ICU segment that follows a top-level '# sequence", () => {
    const i18n = createI18n({ locale: "en" });

    expect(() =>
      i18n.addTranslations({ en: { items: "'#{count, plural, one {item} other {items}}" } }),
    ).toThrow(/is ICU "plural" syntax/);
  });
});
