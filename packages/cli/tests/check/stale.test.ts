import { describe, expect, it } from "vitest";
import { check } from "./run";

describe("check rule: stale", () => {
  it("reports a target key the source does not have as a warning", () => {
    const report = check({ a: "A" }, { a: "A2", old: "Alt", older: "" });

    expect(report.locales.de.stale).toEqual(["old", "older"]);
    expect(report.summary.stale).toBe(2);
    expect(report.warnings).toBe(2);
    expect(report.errors).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("fails under strict", () => {
    const report = check({ a: "A" }, { a: "A2", old: "Alt" }, { strict: true });

    expect(report.warnings).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("passes strict with no warnings", () => {
    expect(check({ a: "A" }, { a: "A2" }, { strict: true }).ok).toBe(true);
  });

  it("does not take a source key inherited from Object.prototype for a real one", () => {
    const report = check({ a: "A" }, { a: "A2", constructor: "x" });

    expect(report.locales.de.stale).toEqual(["constructor"]);
  });
});
