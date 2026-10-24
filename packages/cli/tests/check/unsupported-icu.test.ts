import { describe, expect, it } from "vitest";
import { CatalogCheck } from "../../src/core/CatalogCheck";
import { check } from "./run";

describe("check rule: unsupported-icu", () => {
  it("reports an argument type core does not compile in the target as an error", () => {
    const report = check({ a: "Total {price}" }, { a: "Summe {price, number}" });

    expect(report.locales.de.unsupportedIcu).toEqual([{ key: "a", argumentType: "number" }]);
    expect(report.source.unsupportedIcu).toEqual([]);
    expect(report.summary.unsupportedIcu).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("reports one in the source once, and compares no parameters for that key", () => {
    const report = check({ a: "On {when, date, short}" }, { a: "Am {day}" });

    expect(report.source.unsupportedIcu).toEqual([{ key: "a", argumentType: "date" }]);
    expect(report.locales.de.unsupportedIcu).toEqual([]);
    expect(report.locales.de.params).toEqual([]);
    expect(report.errors).toBe(1);
  });

  it("reports a source key with an unsupported argument even when no target has the key", () => {
    const report = CatalogCheck.run({
      translations: {
        en: { default: { a: "{p, number}" } },
        de: { default: {} },
        fr: { default: {} },
      },
      source: "en",
      targets: ["de", "fr"],
      namespaces: ["default"],
    });

    expect(report.source.unsupportedIcu).toEqual([{ key: "a", argumentType: "number" }]);
    expect(report.summary.unsupportedIcu).toBe(1);
    expect(report.summary.missing).toBe(2);
    expect(report.errors).toBe(3);
  });

  it("reports both sides once each", () => {
    const report = check({ a: "{p, number}" }, { a: "{p, time}" });

    expect(report.source.unsupportedIcu).toEqual([{ key: "a", argumentType: "number" }]);
    expect(report.locales.de.unsupportedIcu).toEqual([{ key: "a", argumentType: "time" }]);
    expect(report.summary.unsupportedIcu).toBe(2);
  });

  it("skips the plural and select comparison of a key with an unsupported argument", () => {
    const report = check(
      { a: "{g, select, a {A} other {B}} {p, number}" },
      { a: "{g, select, other {B}} {n, plural, few {x} other {y}}" },
    );

    expect(report.locales.de.select).toEqual([]);
    expect(report.locales.de.plural).toEqual([]);
  });

  it("still compares the tags of a key with an unsupported argument", () => {
    const report = check({ a: "<b>{p, number}</b>" }, { a: "{p, number}" });

    expect(report.locales.de.tags).toEqual([{ key: "a", source: ["b"], target: [] }]);
  });

  it("passes supported arguments", () => {
    const report = check(
      { a: "{n, plural, one {#} other {#}}" },
      { a: "{n, plural, one {#} other {#}}" },
    );

    expect(report.locales.de.unsupportedIcu).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
