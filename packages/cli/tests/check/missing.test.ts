import { describe, expect, it } from "vitest";
import { check } from "./run";

describe("check rule: missing", () => {
  it("reports a source key the target lacks as an error", () => {
    const report = check({ a: "A", b: "B" }, { a: "A2" });

    expect(report.locales.de.missing).toEqual(["b"]);
    expect(report.summary.missing).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.warnings).toBe(0);
    expect(report.ok).toBe(false);
  });

  it("counts an empty target value as missing, and a whitespace-only one too: stricter than core, since a whitespace-only value renders blank", () => {
    const report = check({ a: "A", b: "B", c: "C" }, { a: "", b: "  \n", c: "C2" });

    expect(report.locales.de.missing).toEqual(["a", "b"]);
  });

  it("passes when every source key is translated", () => {
    const report = check({ a: "A", b: "B" }, { b: "B2", a: "A2" });

    expect(report.locales.de.missing).toEqual([]);
    expect(report.errors).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("reports every key of a namespace the target has no file for, named with the namespace", () => {
    const report = check(
      {},
      {},
      {
        translations: { en: { admin: { title: "T", save: "S" } }, de: {} },
        namespaces: ["admin"],
      },
    );

    expect(report.locales.de.missing).toEqual(["admin:save", "admin:title"]);
    expect(report.keys).toBe(2);
  });

  it("does not read an inherited member as a translation", () => {
    const report = check({ toString: "To string" }, {});

    expect(report.locales.de.missing).toEqual(["toString"]);
  });

  it("sums missing keys across locales in the summary", () => {
    const report = check(
      {},
      {},
      {
        translations: {
          en: { default: { a: "A", b: "B" } },
          de: { default: {} },
          fr: { default: { a: "A" } },
        },
        targets: ["fr", "de"],
      },
    );

    expect(Object.keys(report.locales)).toEqual(["de", "fr"]);
    expect(report.summary.missing).toBe(3);
    expect(report.errors).toBe(3);
  });

  it("orders findings by namespace, then key", () => {
    const report = check(
      {},
      {},
      {
        translations: { en: { b: { x: "X" }, a: { z: "Z", y: "Y" } }, de: {} },
        namespaces: ["b", "a"],
      },
    );

    expect(report.locales.de.missing).toEqual(["a:y", "a:z", "b:x"]);
  });

  it("reports every key missing for a target with no catalog at all", () => {
    const report = check({ a: "A" }, {}, { translations: { en: { default: { a: "A" } } } });

    expect(report.locales.de.missing).toEqual(["a"]);
  });
});
