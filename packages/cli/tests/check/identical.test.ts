import { describe, expect, it } from "vitest";
import { check } from "./run";

describe("check rule: identical (opt-in)", () => {
  it("reports a target equal to its source as a warning when enabled", () => {
    const report = check({ a: "OK", b: "Save" }, { a: "OK", b: "Speichern" }, { identical: true });

    expect(report.locales.de.identical).toEqual(["a"]);
    expect(report.summary.identical).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.errors).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("is off by default", () => {
    const report = check({ a: "OK" }, { a: "OK" });

    expect(report.locales.de.identical).toEqual([]);
    expect(report.warnings).toBe(0);
  });

  it("fails under strict", () => {
    expect(check({ a: "OK" }, { a: "OK" }, { identical: true, strict: true }).ok).toBe(false);
  });
});
