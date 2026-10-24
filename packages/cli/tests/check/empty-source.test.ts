import { describe, expect, it } from "vitest";
import { CatalogCheck } from "../../src/core/CatalogCheck";
import { check } from "./run";

describe("check rule: empty-source", () => {
  it("reports an empty or blank source message once, as an error, and compares nothing else for it", () => {
    const report = check({ c: "C", b: " ", a: "" }, { a: "A {x}", c: "C2" });

    expect(report.source.emptySource).toEqual(["a", "b"]);
    expect(report.locales.de.missing).toEqual([]);
    expect(report.locales.de.params).toEqual([]);
    expect(report.summary.emptySource).toBe(2);
    expect(report.errors).toBe(2);
    expect(report.ok).toBe(false);
  });

  it("counts an empty source once however many locales compare against it", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "" } }, de: { default: {} }, fr: { default: {} } },
      source: "en",
      targets: ["de", "fr"],
      namespaces: ["default"],
    });

    expect(report.source.emptySource).toEqual(["a"]);
    expect(report.summary.emptySource).toBe(1);
    expect(report.errors).toBe(1);
  });

  it("is reported with no target locale at all", () => {
    const report = CatalogCheck.run({
      translations: { en: { default: { a: "", b: "B" } } },
      source: "en",
      targets: [],
      namespaces: ["default"],
    });

    expect(report.source).toMatchObject({ locale: "en", emptySource: ["a"] });
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("passes with a non-empty source", () => {
    const report = check({ a: "A" }, { a: "A2" });

    expect(report.source.emptySource).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
