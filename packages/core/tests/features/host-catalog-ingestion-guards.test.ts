import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("addTranslations() dev guidance for a non-flat catalog", () => {
  it("names the locale and the offending key, and says the host stores catalogs verbatim", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.addTranslations({ en: { nav: { home: "Home" } } as never });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('addTranslations("en"): "nav" is not a string'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("catalogs as given — pass a FLAT catalog"),
    );
  });

  it("stores a null leaf verbatim rather than failing the ingestion preflight", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.addTranslations({ en: { total: null } as never });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"total" is not a string'));
    expect(i18n.hasTranslation("total")).toBe(true);
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
