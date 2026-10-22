import { describe, expect, it } from "vitest";
import { CatalogCheck } from "../../src/core/CatalogCheck";
import { check } from "./run";

describe("check rule: tags", () => {
  it("reports a target that drops a tag the source uses as an error", () => {
    const report = check({ a: "Read the <link>terms</link>" }, { a: "Lies die Bedingungen" });

    expect(report.locales.de.tags).toEqual([{ key: "a", source: ["link"], target: [] }]);
    expect(report.summary.tags).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("reports a target that uses a different tag", () => {
    const report = check({ a: "Read the <link>terms</link>" }, { a: "Lies <b>sie</b>" });

    expect(report.locales.de.tags).toEqual([{ key: "a", source: ["link"], target: ["b"] }]);
  });

  it("passes the same tags", () => {
    const report = check(
      { a: "<b>Read</b> <link>terms</link>" },
      { a: "<link>Lies</link> <b>sie</b>" },
    );

    expect(report.locales.de.tags).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("ignores target tags when the source has none", () => {
    const report = check({ a: "Read the terms" }, { a: "Lies <b>die</b> Bedingungen" });

    expect(report.locales.de.tags).toEqual([]);
    expect(report.errors).toBe(0);
  });

  it("reports an unbalanced tag in the target as a warning", () => {
    const report = check({ a: "x" }, { a: "<b>x" });

    expect(report.locales.de.unbalancedTags).toEqual([{ key: "a", tags: ["b"] }]);
    expect(report.summary.unbalancedTags).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("reports an unbalanced tag in the source once, as a warning", () => {
    const report = CatalogCheck.run({
      translations: {
        en: { default: { a: "<b>x" } },
        de: { default: { a: "<b>x</b>" } },
        fr: { default: { a: "<b>x</b>" } },
      },
      source: "en",
      targets: ["de", "fr"],
      namespaces: ["default"],
    });

    expect(report.source.unbalancedTags).toEqual([{ key: "a", tags: ["b"] }]);
    expect(report.locales.de.unbalancedTags).toEqual([]);
    expect(report.summary.unbalancedTags).toBe(1);
    expect(report.warnings).toBe(1);
  });

  it("fails an unbalanced tag under strict", () => {
    expect(check({ a: "x" }, { a: "<b>x" }, { strict: true }).ok).toBe(false);
  });

  it("reports a source tag the target leaves unclosed as lost, since core renders it as text", () => {
    const report = check({ a: "<b>x</b>" }, { a: "<b>x" });

    expect(report.locales.de.tags).toEqual([{ key: "a", source: ["b"], target: [] }]);
    expect(report.locales.de.unbalancedTags).toEqual([{ key: "a", tags: ["b"] }]);
    expect(report.errors).toBe(1);
    expect(report.warnings).toBe(1);
  });
});
