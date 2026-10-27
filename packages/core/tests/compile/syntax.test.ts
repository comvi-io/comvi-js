/**
 * Syntax errors are fail-soft: `compile()` never throws for a bad template; the message
 * renders its key and reports `syntax` on every render, through the env of whichever
 * instance renders it (the compiled record is shared, R4-2).
 * Ported by meaning from: audit-icu-malformed-choices, icu-argument-shapes (errors),
 * security (unclosed braces), tags-scanner-boundaries (mismatch/unclosed).
 */
import { describe, expect, it, vi } from "vitest";
import { compile, render } from "../../src/compile/cache";
import { BAD, fmt, sink } from "../helpers";

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
        `{x, ${type}} is not supported: format it in code with useFormat() and pass a plain {x}`,
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
