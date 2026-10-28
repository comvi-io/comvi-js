import { describe, expect, it, vi } from "vitest";
import { CatalogCheck } from "../../src/core/CatalogCheck";
import { check } from "./run";

describe("check rule: plural (injected categories)", () => {
  it("reports a target plural without `other` as an error", () => {
    const report = check({ a: "{n, plural, one {#} other {#}}" }, { a: "{n, plural, one {#}}" });

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
    expect(report.summary.plural).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.warnings).toBe(0);
    expect(report.ok).toBe(false);
  });

  it("judges each plural of an argument written twice on its own", () => {
    const report = check(
      { a: "{n, plural, one {A} other {B}} / {n, plural, one {C} other {D}}" },
      { a: "{n, plural, one {A} other {B}} / {n, plural, one {C}}" },
    );

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
  });

  it("reports a selector the locale does not have as an error", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, one {#} few {#} many {#} other {#}}" },
    );

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["few", "many"] },
    ]);
    expect(report.errors).toBe(1);
  });

  it("reports a category the locale has and the target lacks as a warning", () => {
    const report = check({ a: "{n, plural, one {#} other {#}}" }, { a: "{n, plural, other {#}}" });

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-category", categories: ["one"] },
    ]);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("accepts exact selectors in every locale", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, =0 {none} =12.5 {x} =-1 {y} =1.25 {z} one {#} other {#}}" },
    );

    expect(report.locales.de.plural).toEqual([]);
  });

  it("refuses a selector that is neither a category nor `=` and a number", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, x1 {none} one {#} other {#}}" },
    );

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["x1"] },
    ]);
  });

  it.each(["=", "=x", "=Infinity", "=0x10", "==1", "=1e"])(
    "reports the exact selector %j, which core does not compile, once as unsupported ICU",
    (selector) => {
      const report = check(
        { a: "{n, plural, one {#} other {#}}" },
        { a: `{n, plural, ${selector} {none} one {#} other {#}}` },
      );

      expect(report.locales.de.unsupportedIcu).toEqual([{ key: "a", argumentType: "plural" }]);
      expect(report.locales.de.plural).toEqual([]);
      expect(report.errors).toBe(1);
    },
  );

  // ICU's number syntax (ICU4C 78), which the 0.8 core compiles: sign, `1.`, `.5`, exponent.
  it.each(["=1e3", "=.5", "=+1", "=1.", "=-2", "=01"])(
    "accepts the exact selector %j, which core compiles",
    (selector) => {
      const report = check(
        { a: "{n, plural, one {#} other {#}}" },
        { a: `{n, plural, ${selector} {none} one {#} other {#}}` },
      );

      expect(report.locales.de.unsupportedIcu).toEqual([]);
      expect(report.locales.de.plural).toEqual([]);
      expect(report.errors).toBe(0);
    },
  );

  it("judges selectordinal against the ordinal rules", () => {
    const pluralCategories = vi.fn((_locale: string, type: string) =>
      type === "ordinal" ? ["one", "two", "few", "other"] : ["one", "other"],
    );
    const report = check(
      { a: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" },
      { a: "{n, selectordinal, one {#.} two {#.} few {#.} other {#.}}" },
      { pluralCategories },
    );

    expect(report.locales.de.plural).toEqual([]);
    expect(pluralCategories).toHaveBeenCalledWith("de", "ordinal");
  });

  it("judges plural against the cardinal rules", () => {
    const pluralCategories = (_locale: string, type: string) =>
      type === "ordinal" ? ["one", "two", "few", "other"] : ["one", "other"];
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, one {#} two {#} other {#}}" },
      { pluralCategories },
    );

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["two"] },
    ]);
  });

  it("skips an argument whose rule type the locale does not know", () => {
    const pluralCategories = (_locale: string, type: string) =>
      type === "ordinal" ? undefined : ["one", "other"];
    const report = check(
      { a: "{n, selectordinal, one {#} other {#}}" },
      { a: "{n, selectordinal, zzz {#} other {#}}" },
      { pluralCategories },
    );

    expect(report.locales.de.plural).toEqual([]);
    expect(report.locales.de.localeUnknown).toBe(false);
  });

  it("marks a locale with no plural rules unknown and judges no category in it", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, zzz {#} other {#}}" },
      { pluralCategories: () => undefined },
    );

    expect(report.locales.de.localeUnknown).toBe(true);
    expect(report.locales.de.plural).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("still requires `other` in an unknown locale", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, zzz {#} =1 {#}}" },
      { pluralCategories: () => undefined },
    );

    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
    expect(report.errors).toBe(1);
  });

  it("passes a target that writes every category", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, other {#} one {#}}" },
    );

    expect(report.locales.de.plural).toEqual([]);
    expect(report.locales.de.localeUnknown).toBe(false);
    expect(report.ok).toBe(true);
  });
});

describe("check rule: plural (more cases)", () => {
  it("skips selectordinal too in a locale with no cardinal rules", () => {
    const report = check(
      { a: "{n, selectordinal, one {#} other {#}}" },
      { a: "{n, selectordinal, zzz {#} other {#}}" },
      { pluralCategories: (_locale, type) => (type === "ordinal" ? ["one", "other"] : undefined) },
    );

    expect(report.locales.de.localeUnknown).toBe(true);
    expect(report.locales.de.plural).toEqual([]);
  });

  it("orders findings by argument", () => {
    const report = check(
      { a: "{z, plural, one {#} other {#}} {b, plural, one {#} other {#}}" },
      { a: "{z, plural, x {#} one {#} other {#}} {b, plural, x {#} one {#} other {#}}" },
    );

    expect(report.locales.de.plural.map((finding) => finding.argument)).toEqual(["b", "z"]);
  });

  it("orders plural and selectordinal findings together by argument", () => {
    const report = check(
      { a: "{z, plural, one {#} other {#}} {b, selectordinal, one {#} other {#}}" },
      { a: "{z, plural, x {#} one {#} other {#}} {b, selectordinal, x {#} one {#} other {#}}" },
    );

    expect(report.locales.de.plural.map((finding) => finding.argument)).toEqual(["b", "z"]);
  });
});

describe("check rule: plural (Intl.PluralRules of this Node)", () => {
  const run = (target: string, message: string) =>
    CatalogCheck.run({
      translations: {
        en: { default: { a: "{n, plural, one {#} other {#}}" } },
        [target]: { default: { a: message } },
      },
      source: "en",
      targets: [target],
      namespaces: ["default"],
    }).locales[target];

  it("knows that pt-br has `many`", () => {
    expect(run("pt-br", "{n, plural, one {#} other {#}}").plural).toEqual([
      { key: "a", argument: "n", problem: "missing-category", categories: ["many"] },
    ]);
  });

  it("knows that ja has only `other`", () => {
    expect(run("ja", "{n, plural, one {#} other {#}}").plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["one"] },
    ]);
  });

  it("uses the ordinal rules for selectordinal", () => {
    const report = CatalogCheck.run({
      translations: {
        en: { default: { a: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" } },
        fr: { default: { a: "{n, selectordinal, one {#er} other {#e}}" } },
      },
      source: "en",
      targets: ["fr"],
      namespaces: ["default"],
    });

    expect(report.locales.fr.plural).toEqual([]);
  });

  it.each(["qq", "not a locale!"])("marks %j unknown instead of using default rules", (locale) => {
    const entry = run(locale, "{n, plural, zzz {#}}");

    expect(entry.localeUnknown).toBe(true);
    expect(entry.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
  });
});

describe("check rule: plural in the source locale", () => {
  it("reports a source plural without `other` once, as an error, with no target at all", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "{n, plural, one {a}}" } } },
      source: "en",
      targets: [],
      namespaces: ["default"],
      pluralCategories: () => ["one", "other"],
    });

    expect(report.source.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
    expect(report.summary.plural).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("judges source selectors against the source locale, once across targets", () => {
    const pluralCategories = vi.fn((locale: string, type: string) =>
      locale === "en" && type === "ordinal" ? ["one", "two", "few", "other"] : ["one", "other"],
    );
    const report = CatalogCheck.run({
      translations: {
        en: { default: { a: "{n, plural, few {x} other {y}} {o, selectordinal, other {#}}" } },
        de: {
          default: { a: "{n, plural, one {x} other {y}} {o, selectordinal, one {#} other {#}}" },
        },
        fr: {
          default: { a: "{n, plural, one {x} other {y}} {o, selectordinal, one {#} other {#}}" },
        },
      },
      source: "en",
      targets: ["de", "fr"],
      namespaces: ["default"],
      pluralCategories,
    });

    expect(report.source.plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["few"] },
      { key: "a", argument: "n", problem: "missing-category", categories: ["one"] },
      { key: "a", argument: "o", problem: "missing-category", categories: ["few", "one", "two"] },
    ]);
    expect(report.locales.de.plural).toEqual([]);
    expect(report.summary.plural).toBe(3);
    expect(report.errors).toBe(1);
    expect(report.warnings).toBe(2);
  });

  it("marks an unknown source locale and judges only `other` there", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "{n, plural, zzz {x}}" } } },
      source: "en",
      targets: [],
      namespaces: ["default"],
      pluralCategories: () => undefined,
    });

    expect(report.source.localeUnknown).toBe(true);
    expect(report.source.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
  });

  it("does not judge the plurals of a source message with an unsupported argument", () => {
    const report = CatalogCheck.run({
      // Core stops at `{p, number}`: the plural after it is never read.
      translations: { en: { default: { a: "{p, number} {n, plural, one {a}}" } } },
      source: "en",
      targets: [],
      namespaces: ["default"],
      pluralCategories: () => ["one", "other"],
    });

    expect(report.source.plural).toEqual([]);
    expect(report.source.unsupportedIcu).toEqual([{ key: "a", argumentType: "number" }]);
  });
});

describe("check rule: plural rules for a locale written with an underscore", () => {
  it.each(["pt_BR", "pt-BR"])("reads %s with the rules of pt-BR", (locale) => {
    const entry = CatalogCheck.run({
      translations: {
        en: { default: { a: "{n, plural, one {x} other {y}}" } },
        [locale]: { default: { a: "{n, plural, invalid {x} one {x} many {x} other {y}}" } },
      },
      source: "en",
      targets: [locale],
      namespaces: ["default"],
    }).locales[locale];

    expect(entry.localeUnknown).toBe(false);
    expect(entry.plural).toEqual([
      { key: "a", argument: "n", problem: "invalid-selector", categories: ["invalid"] },
    ]);
  });
});
