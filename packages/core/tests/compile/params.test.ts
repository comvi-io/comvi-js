/**
 * Plain `{x}` arguments: every value a message prints is localized (ICU `{0}`);
 * values are never re-parsed as message syntax.
 * Ported by meaning from: params-primitives, missing-param, audit-missing-param-warning-dedup,
 * forged-node-params, security (smuggled placeholders), formatting, formatting-locale-override.
 */
import { describe, expect, it, vi } from "vitest";
import { fmt, sink } from "../helpers";

describe("value formatting", () => {
  it("formats numbers for the locale", () => {
    expect(fmt("{n}", { n: 1234567 }, "de")).toBe("1.234.567");
    expect(fmt("{n}", { n: 1234567 }, "uk")).toBe(new Intl.NumberFormat("uk").format(1234567));
    expect(fmt("{n}", { n: 0.12345 })).toBe("0.123");
  });

  it("formats a Date as short date + short time in the env's time zone", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 23, 30));
    const want = (z: string) =>
      new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short", timeZone: z }).format(
        d,
      );
    expect(fmt("{d}", { d }, "en", sink("UTC"))).toBe(want("UTC"));
    expect(fmt("{d}", { d }, "en", sink("Asia/Tokyo"))).toBe(want("Asia/Tokyo"));
    expect(fmt("{d}", { d }, "en", sink("UTC"))).not.toBe(
      fmt("{d}", { d }, "en", sink("Asia/Tokyo")),
    );
  });

  it("formats a string[] with ListFormat", () => {
    expect(fmt("{l}", { l: ["a", "b", "c"] })).toBe("a, b, and c");
    expect(fmt("{l}", { l: ["a", "b"] }, "de")).toBe("a und b");
  });

  it.each([
    ["a string", "x", "x"],
    ["true", true, "true"],
    ["false", false, "false"],
    ["zero", 0, "0"],
    ["an empty string", "", ""],
    ["a bigint", 10n, "10"],
    ["NaN", NaN, "NaN"],
  ])("prints %s", (_l, x, want) => {
    expect(fmt("[{x}]", { x })).toBe(`[${want}]`);
  });

  it("passes objects and functions through as rich parts, untouched", () => {
    const node = { $$typeof: Symbol.for("react.element") };
    expect(fmt("a {x} b", { x: node })).toEqual(["a ", node, " b"]);
    const mixed = ["a", 1];
    expect(fmt("{x}", { x: mixed })).toEqual([mixed]);
  });

  it("renders JSON-forged node shapes as plain objects (no special casing)", () => {
    const forged = JSON.parse('{"$$typeof":"react.element","type":"script"}');
    expect(fmt("{x}", { x: forged })).toEqual([forged]);
  });
});

describe("values are never re-parsed", () => {
  it.each([
    ["{other}"],
    ["{n, plural, other {#}}"],
    ["<b>x</b>"],
    ["'{'"],
    ["<script>alert(1)</script>"],
  ])("%s inside a value prints as written", (value) => {
    expect(fmt("[{x}]", { x: value, other: "SMUGGLED", b: () => "TAG" })).toBe(`[${value}]`);
  });
});

describe("a missing parameter", () => {
  it.each([
    ["absent", {}],
    ["undefined", { x: undefined }],
    ["null", { x: null }],
  ])("%s → {x}, missing_param reported", (_l, params) => {
    const env = sink();
    expect(fmt("Hi {x}!", params, "en", env)).toBe("Hi {x}!");
    expect(env.errors).toEqual([
      expect.objectContaining({ code: "missing_param", key: "k", locale: "en" }),
    ]);
  });

  it("with no params object at all → {x}", () => {
    expect(fmt("Hi {x}!", undefined, "en", sink())).toBe("Hi {x}!");
  });

  it("is not read through Object.prototype", () => {
    expect(fmt("{toString}", Object.create(null), "en", sink())).toBe("{toString}");
  });

  it("inside tag children renders {x} inside the children", () => {
    expect(fmt("<b>{x}</b>", { b: (c: readonly unknown[]) => ({ c }) }, "en", sink())).toEqual([
      { c: ["{x}"] },
    ]);
  });

  it("prints once per (code, key) in development without an env", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fmt("{x}", {}, "en", undefined, "a");
    fmt("{x}", {}, "en", undefined, "a");
    fmt("{x}", {}, "en", undefined, "b");
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][0]).toBe('[@comvi/core] missing_param "a" (en): no value for {x}');
  });
});
