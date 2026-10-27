/**
 * The default reporter (development project: `__DEV__` true).
 * Ported by meaning from: dev-mode, dev-warning-resets, error-stems, host-error-reporting.
 */
import { describe, expect, it, vi } from "vitest";
import { _resetDiagnostics, defaultOnError, devWarn } from "../src/errors";

describe("defaultOnError in development", () => {
  it("prints each (code, key, param) once — a second parameter of the same key prints too", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "missing_param", key: "k", param: "a", message: "no value for {a}" });
    defaultOnError({ code: "missing_param", key: "k", param: "a", message: "other text" });
    defaultOnError({ code: "missing_param", key: "k", param: "b", message: "no value for {b}" });
    expect(error.mock.calls.map((c) => c[0])).toEqual([
      '[@comvi/core] missing_param "k": no value for {a}',
      '[@comvi/core] missing_param "k": no value for {b}',
    ]);
  });

  it("prints a keyless report once per (locale, ns)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "load_failed", locale: "de", ns: "shop" });
    defaultOnError({ code: "load_failed", locale: "de", ns: "shop" });
    defaultOnError({ code: "load_failed", locale: "fr", ns: "shop" });
    defaultOnError({ code: "load_failed", locale: "de", ns: "default" });
    expect(error).toHaveBeenCalledTimes(3);
  });

  it("prints each (code, key) once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "missing_key", key: "a", locale: "en" });
    defaultOnError({ code: "missing_key", key: "a", locale: "de" });
    defaultOnError({ code: "missing_param", key: "a" });
    defaultOnError({ code: "missing_key", key: "b", message: "why" });
    expect(error.mock.calls.map((c) => c[0])).toEqual([
      '[@comvi/core] missing_key "a" (en)',
      '[@comvi/core] missing_param "a"',
      '[@comvi/core] missing_key "b": why',
    ]);
  });

  it("prints again after the dedupe set is reset", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "syntax", key: "a" });
    _resetDiagnostics();
    defaultOnError({ code: "syntax", key: "a" });
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe("devWarn", () => {
  it("prints once per id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    devWarn("x", "one");
    devWarn("x", "two");
    devWarn("y", "three");
    expect(warn.mock.calls.map((c) => c[0])).toEqual(["[@comvi/core] one", "[@comvi/core] three"]);
  });
});
