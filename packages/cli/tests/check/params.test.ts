import { describe, expect, it } from "vitest";
import { check } from "./run";

describe("check rule: params", () => {
  it("reports differing parameter names as an error, each side sorted", () => {
    const report = check({ a: "{b} and {a}" }, { a: "{a} only" });

    expect(report.locales.de.params).toEqual([{ key: "a", source: ["a", "b"], target: ["a"] }]);
    expect(report.summary.params).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.ok).toBe(false);
  });

  it("reports a renamed parameter of the same count", () => {
    const report = check({ a: "Hi {name}" }, { a: "Hallo {nom}" });

    expect(report.locales.de.params).toEqual([{ key: "a", source: ["name"], target: ["nom"] }]);
  });

  it("reports a parameter only the target uses", () => {
    const report = check({ a: "Hi" }, { a: "Hallo {name}" });

    expect(report.locales.de.params).toEqual([{ key: "a", source: [], target: ["name"] }]);
  });

  it("passes the same names in another order and repeated", () => {
    const report = check(
      { a: "{x} {y}", b: "{n, plural, one {#} other {#}} {who}" },
      { a: "{y} {x} {y}", b: "{who}: {n, plural, other {#}}" },
    );

    expect(report.locales.de.params).toEqual([]);
    expect(report.errors).toBe(0);
  });

  it("reads each source message once however many targets compare against it", () => {
    const report = check(
      {},
      {},
      {
        translations: {
          en: { default: { a: "{x}" } },
          de: { default: { a: "{x}" } },
          fr: { default: { a: "{y}" } },
        },
        targets: ["de", "fr"],
      },
    );

    expect(report.locales.de.params).toEqual([]);
    expect(report.locales.fr.params).toEqual([{ key: "a", source: ["x"], target: ["y"] }]);
  });
});
