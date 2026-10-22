import { describe, expect, it } from "vitest";
import { check } from "./run";

const SOURCE = "{g, select, female {She} male {He} other {They}}";

describe("check rule: select", () => {
  it("reports differing select selectors as an error", () => {
    const report = check({ a: SOURCE }, { a: "{g, select, male {Er} other {Sie}}" });

    expect(report.locales.de.select).toEqual([
      { key: "a", argument: "g", source: ["female", "male", "other"], target: ["male", "other"] },
    ]);
    expect(report.summary.select).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("reports a select the target writes as a plain parameter", () => {
    const report = check({ a: SOURCE }, { a: "{g}" });

    expect(report.locales.de.select).toEqual([
      { key: "a", argument: "g", source: ["female", "male", "other"], target: [] },
    ]);
  });

  it("reports a select only the target has", () => {
    const report = check({ a: "{g}" }, { a: "{g, select, x {X} other {Y}}" });

    expect(report.locales.de.select).toEqual([
      { key: "a", argument: "g", source: [], target: ["other", "x"] },
    ]);
  });

  it("passes the same selectors in another order", () => {
    const report = check({ a: SOURCE }, { a: "{g, select, other {Sie} male {Er} female {Sie}}" });

    expect(report.locales.de.select).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
