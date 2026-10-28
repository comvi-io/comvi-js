import { compile, render, type Rendered } from "../src/compile/cache";
import type { Env, Params } from "../src/compile/scanner";
import type { I18nError } from "../src/errors";

/** An env that records every report instead of printing it. */
export const sink = (): Env & { errors: I18nError[] } => {
  const errors: I18nError[] = [];
  return { r: (e) => errors.push(e), errors };
};

/** Compiles `template` under `key` and renders it once. */
export const fmt = (
  template: string,
  params?: Params,
  locale = "en",
  env?: Env,
  key = "k",
): Rendered => render(compile(template, key), params, locale, env);

/** Argument values of the golden fixtures: `{ $date }` → Date. */
export const revive = (args: Record<string, unknown>): Params =>
  Object.fromEntries(
    Object.entries(args).map(([k, v]) => [
      k,
      v && typeof v === "object" && "$date" in v ? new Date((v as { $date: number }).$date) : v,
    ]),
  );

/** Templates that do not compile, with a fragment of the development explanation. */
export const BAD = [
  ["{n", "unclosed `{`"],
  ["{}", "invalid argument"],
  ["{a b}", "invalid argument"],
  ["{n, plural}", "has no choice list"],
  ["{n, plural{other {x}}}", "has no choice list"],
  ["{n, plural, one {x}}", "needs an `other` branch"],
  ["{g, select, a {x}}", "needs an `other` branch"],
  ["{n, plural, one x other {y}}", "has no {sub-message}"],
  ["{n, plural, one}x} other {b}}", "selector `one` in `{n, plural, …}` has no {sub-message}"],
  ["{n, plural, one {x} other {y}", "never closed"],
  ["{n, plural, other {y", "a sub-message of `{n, plural, …}` is never closed"],
  ["{n, plural, =abc {x} other {y}}", "invalid selector `=abc`"],
  ["{n, plural, =0x1 {x} other {y}}", "invalid selector `=0x1`"],
  ["{n, plural, =1e {x} other {y}}", "invalid selector `=1e`"],
  ["{n, plural, =\u221e {x} other {y}}", "invalid selector `=\u221e`"],
  ["{n,\u00a0plural, other {y}}", "unknown argument type `\u00a0plural`"],
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
