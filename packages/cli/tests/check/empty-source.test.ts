import { describe, expect, it } from "vitest";
import { check } from "./run";

describe("check rule: empty-source", () => {
  it("reports an empty or blank source message as an error and compares nothing else for it", () => {
    const report = check({ a: "", b: " ", c: "C" }, { a: "A {x}", c: "C2" });

    expect(report.locales.de.emptySource).toEqual(["a", "b"]);
    expect(report.locales.de.missing).toEqual([]);
    expect(report.locales.de.params).toEqual([]);
    expect(report.summary.emptySource).toBe(2);
    expect(report.errors).toBe(2);
    expect(report.ok).toBe(false);
  });

  it("passes with a non-empty source", () => {
    const report = check({ a: "A" }, { a: "A2" });

    expect(report.locales.de.emptySource).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
