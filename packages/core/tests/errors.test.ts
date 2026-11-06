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

describe("defaultOnError ids and text", () => {
  it("prints a keyless report without a key part", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "missing_key", locale: "de", ns: "shop" });
    expect(error.mock.calls[0][0]).toBe("[@comvi/core] missing_key (de)");
  });

  it("load_failed names the locale, the namespace and the cause: two namespaces read differently", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "load_failed", locale: "de", ns: "shop", cause: new Error("404 shop") });
    defaultOnError({ code: "load_failed", locale: "de", ns: "cart", cause: new Error("500 cart") });
    expect(error.mock.calls.map((c) => c[0])).toEqual([
      '[@comvi/core] load_failed (de, namespace "shop"): 404 shop',
      '[@comvi/core] load_failed (de, namespace "cart"): 500 cart',
    ]);
  });

  it.each([
    ["a string", "boom", "boom"],
    ["a number", 503, "503"],
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["a plain object", { status: 404 }, "[object Object]"],
    ["an object without toString", Object.create(null), "(cause not printable)"],
    [
      "a toString that throws",
      {
        toString() {
          throw new Error("no");
        },
      },
      "(cause not printable)",
    ],
    [
      "an Error whose message is a symbol",
      Object.defineProperty(new Error(), "message", { value: Symbol("boom") }),
      "Symbol(boom)",
    ],
    [
      "an Error whose message cannot print",
      Object.defineProperty(new Error(), "message", {
        value: {
          toString() {
            throw 1;
          },
        },
      }),
      "(cause not printable)",
    ],
  ])("load_failed prints a rejection with %s, never crashing", (label, cause, text) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "load_failed", locale: "de", ns: label, cause });
    expect(error.mock.calls[0][0]).toBe(
      `[@comvi/core] load_failed (de, namespace "${label}"): ${text}`,
    );
  });

  it("other codes keep their output: their `cause` and `ns` are not printed", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "invalid_locale", locale: "!!", ns: "shop", cause: new Error("x") });
    expect(error.mock.calls[0][0]).toBe("[@comvi/core] invalid_locale (!!)");
  });

  it("never lets two (locale, ns) pairs or two (key, param) pairs share an id", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    defaultOnError({ code: "load_failed", locale: "en", ns: "gb" });
    defaultOnError({ code: "load_failed", locale: "eng", ns: "b" });
    defaultOnError({ code: "missing_param", key: "a", param: "bc" });
    defaultOnError({ code: "missing_param", key: "ab", param: "c" });
    expect(error).toHaveBeenCalledTimes(4);
  });
});
