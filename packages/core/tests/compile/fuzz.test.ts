/**
 * Message fuzz: random templates over the grammar's alphabet never throw out of
 * `compile()` or a render, render deterministically, and fail only through `syntax`.
 * Ported by meaning from: message-fuzz (+ prod/message-fuzz via the prod project,
 * which re-runs the golden table), security.
 *
 * Deterministic: a seeded PRNG, a fixed number of cases (no wall clock).
 */
import { describe, expect, it } from "vitest";
import { compile, render } from "../../src/compile/cache";
import { sink } from "../helpers";

const ALPHABET = [
  "{",
  "}",
  "'",
  "''",
  "#",
  ",",
  " ",
  "<b>",
  "</b>",
  "<br/>",
  "<",
  ">",
  "/",
  "n",
  "g",
  "x",
  "plural",
  "select",
  "selectordinal",
  "offset:1",
  "one",
  "other",
  "=0",
  "=1",
  "{n, plural, ",
  "{g, select, ",
  "{x}",
  "other {",
  "one {",
  "🎉",
  "é",
];

const prng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe("fuzz", () => {
  it("5,000 random templates: no throw, deterministic, only `syntax` / `missing_param` reports", () => {
    const rnd = prng(42);
    const params = {
      n: 3,
      g: "a",
      x: "X",
      b: (c: readonly unknown[]) => `[${c.join("")}]`,
      br: () => "|",
    };
    let compiled = 0;
    for (let i = 0; i < 5_000; i++) {
      let t = "";
      const len = 1 + Math.floor(rnd() * 12);
      for (let j = 0; j < len; j++) t += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
      const env = sink();
      const c = compile(t, "fz");
      const a = render(c, params, "en", env);
      const b = render(c, params, "en", env);
      expect(b).toEqual(a);
      expect(typeof a === "string" || Array.isArray(a)).toBe(true);
      for (const e of env.errors) expect(["syntax", "missing_param"]).toContain(e.code);
      if (!env.errors.some((e) => e.code === "syntax")) compiled++;
    }
    // the alphabet is rich enough that a fair share of templates are valid
    expect(compiled).toBeGreaterThan(1_000);
  });

  it("survives pathological nesting without a stack overflow for realistic depth", () => {
    let t = "x";
    for (let i = 0; i < 200; i++) t = `{n, plural, other {${t}}}`;
    expect(render(compile(t), { n: 1 }, "en")).toBe("x");
  });

  it("a 100K-character template compiles and renders", () => {
    const t = "a {x} ".repeat(20_000);
    expect((render(compile(t), { x: 1 }, "en") as string).length).toBe("a 1 ".length * 20_000);
  });
});
