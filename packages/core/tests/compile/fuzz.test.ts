/**
 * Message fuzz: random templates over the grammar's alphabet, rendered with random
 * parameter VALUES (invalid Dates, prototype names, null, functions, symbols…), never
 * throw out of `compile()` or a render, render deterministically, and fail only through
 * `syntax` / `missing_param`. The same corpus runs in BOTH projects — `unit`
 * (`__DEV__` true) and `prod` (`__DEV__` false; vitest.config.ts includes this file).
 * Ported by meaning from: message-fuzz, prod/message-fuzz, security.
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
  // names that exist on Object.prototype: never a parameter or a tag handler (own only)
  "{toString}",
  "{constructor}",
  "{__proto__}",
  "<valueOf>",
  "</valueOf>",
  "<hasOwnProperty/>",
  "{constructor, select, ",
  "{valueOf, plural, ",
  "{d}",
  "{v}",
];

/** Values a caller can pass; each fuzz case draws `d` and `v` from here. */
const VALUES: unknown[] = [
  new Date(NaN),
  new Date(0),
  null,
  undefined,
  NaN,
  -0,
  Infinity,
  1e21,
  "",
  "{x}",
  10n,
  Symbol("s"),
  () => "fn",
  () => undefined,
  [],
  ["a", "b"],
  ["a", 1],
  Object.create(null),
  { toString: () => "own" },
];

const prng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe("fuzz", () => {
  it("5,000 random templates × values: no throw, deterministic, only `syntax` / `missing_param` reports", () => {
    const rnd = prng(42);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    let compiled = 0;
    for (let i = 0; i < 5_000; i++) {
      let t = "";
      const len = 1 + Math.floor(rnd() * 12);
      for (let j = 0; j < len; j++) t += pick(ALPHABET);
      const params = {
        n: 3,
        g: "a",
        x: "X",
        b: (c: readonly unknown[]) => `[${c.join("")}]`,
        br: () => "|",
        d: pick(VALUES),
        v: pick(VALUES),
      };
      const env = sink("UTC");
      const c = compile(t, "fz");
      const locale = pick(["en", "de", "ar-EG"]);
      const a = render(c, params, locale, env);
      const b = render(c, params, locale, env);
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
