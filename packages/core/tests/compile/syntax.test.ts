/**
 * Syntax errors are fail-soft: `compile()` never throws for a bad template; the message
 * renders its key and reports `syntax` on every render, through the env of whichever
 * instance renders it (the compiled record is shared, R4-2).
 * Ported by meaning from: audit-icu-malformed-choices, icu-argument-shapes (errors),
 * security (unclosed braces), tags-scanner-boundaries (mismatch/unclosed).
 */
import { describe, expect, it, vi } from "vitest";
import { compile, render } from "../../src/compile/cache";
import { fmt, sink } from "../helpers";

const BAD = [
  ["{n", "unclosed `{`"],
  ["{}", "invalid argument"],
  ["{a b}", "invalid argument"],
  ["{n, plural}", "has no choice list"],
  ["{n, plural, one {x}}", "needs an `other` branch"],
  ["{g, select, a {x}}", "needs an `other` branch"],
  ["{n, plural, one x other {y}}", "has no {sub-message}"],
  ["{n, plural, one {x} other {y}", "never closed"],
  ["{n, plural, other {y", "never closed"],
  ["{n, plural, =abc {x} other {y}}", "invalid selector `=abc`"],
  ["{n, plural, =0x1 {x} other {y}}", "invalid selector `=0x1`"],
  ["{n, plural, =1e3 {x} other {y}}", "invalid selector `=1e3`"],
  ["{g, select, =1 {x} other {y}}", "invalid selector `=1`"],
  ["{g, select, offset:1 other {x}}", "invalid selector `offset:1`"],
  ["{g, select, a:b {x} other {z}}", "invalid selector `a:b`"],
  ["{n, spellout}", "unknown argument type `spellout`"],
  ["{n, choice, 0#a|1#b}", "unknown argument type `choice`"],
  ["<b>unclosed", "`<b>` is never closed"],
  ["<b>x</i>", "`</i>` closes no open tag"],
  ["x</b>", "`</b>` closes no open tag"],
  ["<b>{n, plural, other {x</b>}}", "closes no open tag"],
  ["{n, plural, other {<b>x}}</b>", "`<b>` is never closed"],
] as const;

describe("a template that does not compile", () => {
  it.each(BAD)("%s → the key, `syntax` reported (%s)", (template, hint) => {
    const env = sink();
    expect(fmt(template, { n: 1, g: "a" }, "en", env, "my.key")).toBe("my.key");
    expect(env.errors).toEqual([
      expect.objectContaining({ code: "syntax", key: "my.key", locale: "en" }),
    ]);
    expect(env.errors[0].message).toContain(hint);
  });

  it.each(["number", "date", "time"])(
    "{x, %s} is a syntax error that points to formatting in code (R3-8)",
    (type) => {
      const env = sink();
      expect(fmt(`Due {x, ${type}, short}`, { x: 1 }, "en", env)).toBe("k");
      expect(env.errors[0].message).toBe(
        `\`{x, ${type}}\` is not supported: format the value in code (useFormat()) and pass it as a plain {x}`,
      );
    },
  );

  it("reports on every render, through the env of the instance that renders", () => {
    const c = compile("{n, plural, one {x}}", "k");
    const a = sink();
    const b = sink();
    render(c, {}, "en", a);
    render(c, {}, "de", b);
    render(c, {}, "de", b);
    expect(a.errors.map((e) => e.locale)).toEqual(["en"]);
    expect(b.errors.map((e) => e.locale)).toEqual(["de", "de"]);
  });

  it("renders the template itself when compiled without a key", () => {
    expect(render(compile("{oops"), {}, "en", sink())).toBe("{oops");
  });

  it("without an env, prints once per (code, key) in development", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = compile("{n", "a.key");
    render(c, {}, "en");
    render(c, {}, "en");
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe('[@comvi/core] syntax "a.key" (en): unclosed `{`');
  });

  it("does not swallow an exception thrown by a tag handler", () => {
    const boom = new Error("handler");
    expect(() =>
      fmt("<b>x</b>", {
        b: () => {
          throw boom;
        },
      }),
    ).toThrow(boom);
  });
});
