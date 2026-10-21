import { describe, expect, it } from "vitest";
import { CatalogCheck } from "../../src/core/CatalogCheck";
import { ONE_OTHER } from "./run";

describe("check: the locales and namespaces compared", () => {
  it("compares a locale listed twice once", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "A" } }, de: { default: {} } },
      source: "en",
      targets: ["de", "de"],
      namespaces: ["default"],
      pluralCategories: ONE_OTHER,
    });

    expect(Object.keys(report.locales)).toEqual(["de"]);
    expect(report.summary.missing).toBe(1);
    expect(report.errors).toBe(1);
  });

  it("compares a namespace listed twice once", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "A" } }, de: { default: {} } },
      source: "en",
      targets: ["de"],
      namespaces: ["default", "default"],
      pluralCategories: ONE_OTHER,
    });

    expect(report.keys).toBe(1);
    expect(report.locales.de.missing).toEqual(["a"]);
  });

  it("never reports on the source as a target", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "A" } }, de: { default: { a: "B" } } },
      source: "en",
      targets: ["en", "de"],
      namespaces: ["default"],
      pluralCategories: ONE_OTHER,
    });

    expect(Object.keys(report.locales)).toEqual(["de"]);
  });

  it("keeps a locale named __proto__ as an entry of the report", () => {
    const translations = Object.create(null) as Record<
      string,
      Record<string, Record<string, string>>
    >;
    translations.en = { default: { a: "A" } };
    translations["__proto__"] = { default: {} };

    const report = CatalogCheck.run({
      translations,
      source: "en",
      targets: ["__proto__"],
      namespaces: ["default"],
      pluralCategories: ONE_OTHER,
    });

    expect(Object.keys(report.locales)).toEqual(["__proto__"]);
    expect(report.locales["__proto__"].missing).toEqual(["a"]);
  });
});
