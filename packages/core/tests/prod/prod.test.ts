/**
 * The production project (`__DEV__` false): silent by default, no development text in
 * reports, and EXACTLY the same rendering as development.
 * Ported by meaning from: prod/error-codes-smoke, prod/icu-literal-fallback,
 * prod/icu-exact-selector-fail-soft, prod/icu-nested-comma, prod/tag-error-codes,
 * prod/message-fuzz, prod/dev-only-guards.
 */
import { describe, expect, it, vi } from "vitest";
import icu4c from "../golden/icu4c.json";
import { defaultOnError, devWarn } from "../../src/errors";
import { BAD, fmt, revive, sink } from "../helpers";

describe("production", () => {
  it("the default reporter and devWarn print nothing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    defaultOnError({ code: "syntax", key: "a" });
    devWarn("x", "y");
    fmt("{n", {}, "en");
    fmt("{x} <b>y</b> {n, plural, other {{g, select, other {#}}}}", { n: 1 }, "en");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports codes without development messages", () => {
    const env = sink();
    fmt("{n, plural, one {x}}", {}, "en", env, "a");
    fmt("{x}", {}, "en", env, "b");
    fmt("{n, plural, other {#}}", { n: "z" }, "en", env, "c");
    // Strict: production reports keep an own `message: undefined` key, as before.
    expect(env.errors).toStrictEqual([
      { code: "syntax", key: "a", locale: "en", message: undefined },
      { code: "missing_param", key: "b", locale: "en", param: "x", message: undefined },
      { code: "missing_param", key: "c", locale: "en", param: "n", message: undefined },
    ]);
  });

  it.each(["number", "date", "time"])(
    "{x, %s} reports `syntax` WITH the useFormat() hint, the one production message (R3-8)",
    (type) => {
      const env = sink();
      expect(fmt(`Due {x, ${type}, short}`, { x: 1 }, "en", env, "due")).toBe("due");
      expect(env.errors).toEqual([
        {
          code: "syntax",
          key: "due",
          locale: "en",
          message: "format it in code with useFormat()",
        },
      ]);
    },
  );

  it("renders the whole ICU4C golden table exactly as development does", () => {
    for (const row of icu4c.rows as {
      pattern: string;
      locale: string;
      args: Record<string, unknown>;
      expected?: string;
    }[]) {
      const out = fmt(row.pattern, revive(row.args), row.locale, sink(), "the.key");
      if (row.expected === undefined) expect(out).toBe("the.key");
      else expect(out).toBe(row.expected);
    }
  });
});

describe("production syntax reports", () => {
  it.each(BAD)("%s → the key, `syntax` with no message (dev hint: %s)", (template) => {
    const env = sink();
    expect(fmt(template, { n: 1, g: "a" }, "en", env, "my.key")).toBe("my.key");
    expect(env.errors).toStrictEqual([
      { code: "syntax", key: "my.key", locale: "en", message: undefined },
    ]);
  });

  it("a select with no value reports `missing_param` with no message", () => {
    const env = sink();
    expect(fmt("{g, select, a {A} other {O}}", {}, "en", env, "s")).toBe("O");
    expect(env.errors).toStrictEqual([
      { code: "missing_param", key: "s", locale: "en", param: "g", message: undefined },
    ]);
  });
});
