import { compile, render, type Rendered } from "../src/compile/cache";
import type { Env, Params } from "../src/compile/scanner";
import type { I18nError } from "../src/errors";

/** An env that records every report instead of printing it. */
export const sink = (z?: string): Env & { errors: I18nError[] } => {
  const errors: I18nError[] = [];
  return { z, r: (e) => errors.push(e), errors };
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
