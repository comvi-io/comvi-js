import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { CatalogCheck } from "../../src/core/CatalogCheck";

/**
 * Budget, not a rule: a real app's catalog (2,000 keys, 11 locales) checks in
 * well under half a second, so `check` stays cheap enough for a pre-commit
 * hook. Real `Intl` plural rules, every message shape the scanner reads.
 */
describe("check performance", () => {
  it("checks 2,000 keys × 11 locales in under 500 ms", () => {
    const locales = ["en", "de", "es", "fr", "it", "ja", "ka", "pt-br", "tr", "vi", "zh-cn"];
    const shapes = [
      (i: number) => `Plain message number ${i}`,
      (i: number) => `Hello {name}, you have {count} items (${i})`,
      (i: number) => `{count, plural, one {# file} other {# files}} ${i}`,
      (i: number) => `{gender, select, female {She} male {He} other {They}} ${i}`,
      (i: number) => `Read the <link>terms ${i}</link> and <b>agree</b>`,
    ];
    const translations: Record<string, Record<string, Record<string, string>>> = {};
    for (const [index, locale] of locales.entries()) {
      const catalog: Record<string, string> = {};
      for (let i = 0; i < 2000; i++) {
        // Targets 1-9 each miss every tenth key (200), so the report is not empty.
        if (index > 0 && i % 10 === index) continue;
        catalog[`section${i % 40}.key${i}`] = shapes[i % shapes.length](i);
      }
      translations[locale] = { default: catalog };
    }

    const start = performance.now();
    const report = CatalogCheck.run({
      translations,
      source: "en",
      targets: locales.slice(1),
      namespaces: ["default"],
    });
    const elapsed = performance.now() - start;

    expect(report.keys).toBe(2000);
    expect(report.summary.missing).toBe(1800);
    expect(elapsed).toBeLessThan(500);
  });
});
