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

  // 0.8 core refuses a message whose tags do not balance and renders its key (an error),
  // where 0.7 rendered the markup as text (a warning).
  it("reports an unclosed tag in the target as a syntax error", () => {
    const report = check({ a: "x" }, { a: "<b>x" });

    expect(report.locales.de.syntax).toEqual([{ key: "a", message: "`<b>` is never closed" }]);
    expect(report.summary.syntax).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("reports a closing tag that closes nothing, and a select without other", () => {
    const report = check({ a: "x", b: "y" }, { a: "x</b>", b: "{g, select, m {He}}" });

    expect(report.locales.de.syntax).toEqual([
      { key: "a", message: "`</b>` closes no open tag" },
      { key: "b", message: "`{g, select, …}` needs an `other` branch" },
    ]);
    expect(report.errors).toBe(2);
  });

  it("reports a broken source message once, as a syntax error", () => {
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

    expect(report.source.syntax).toEqual([{ key: "a", message: "`<b>` is never closed" }]);
    expect(report.locales.de.syntax).toEqual([]);
    expect(report.summary.syntax).toBe(1);
    expect(report.errors).toBe(1);
  });

  it("a plural without other is a plural finding, not a second syntax finding", () => {
    const report = check({ a: "{n, plural, one {#} other {#}}" }, { a: "{n, plural, one {#}}" });

    expect(report.locales.de.syntax).toEqual([]);
    expect(report.locales.de.plural).toEqual([
      { key: "a", argument: "n", problem: "missing-other", categories: ["other"] },
    ]);
    expect(report.errors).toBe(1);
  });

  it("compares no params of a key core cannot read to the end", () => {
    const report = check({ a: "<b>{x}</b> {y}" }, { a: "<b>{x} {y}" });

    expect(report.locales.de.params).toEqual([]);
    expect(report.locales.de.syntax).toHaveLength(1);
  });
});
