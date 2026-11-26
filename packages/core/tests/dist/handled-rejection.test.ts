/**
 * The BUILT entry, both builds (production `comvi-core.js`, development `comvi-core.dev.js`):
 * with `onError`, an ignored `setLocale()` / `load()` that fails raises no
 * `unhandledRejection`; without it, the rejection stays globally visible. `unhandled()` sets
 * Vitest's own listeners aside meanwhile (see tests/instance/handled-rejection.test.ts).
 * Requires a fresh build (turbo runs `build` before `test`).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type * as Core from "../../src/index";

const DIST = path.resolve(__dirname, "../../dist");

const unhandled = async (fn: () => unknown): Promise<unknown[]> => {
  const seen: unknown[] = [];
  const own = process.listeners("unhandledRejection");
  const on = (e: unknown) => void seen.push(e);
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", on);
  try {
    await fn();
    await new Promise((y) => setTimeout(y, 0));
  } finally {
    process.off("unhandledRejection", on);
    for (const l of own) process.on("unhandledRejection", l);
  }
  return seen;
};

const boom = new Error("boom");

describe.each(["", ".dev"])("comvi-core%s.js", (suffix) => {
  const setup = async (withOnError: boolean) => {
    const { createI18n } = (await import(
      pathToFileURL(path.join(DIST, `comvi-core${suffix}.js`)).href
    )) as typeof Core;
    const errors: Core.I18nError[] = [];
    const o: Core.I18nOptions = {
      locale: "en",
      catalogs: { default: { en: { a: "A" } } },
      loader: (l, n) => (l == "fr" || n == "extra" ? Promise.reject(boom) : Promise.resolve({})),
    };
    if (withOnError) o.onError = (e) => void errors.push(e);
    return { i18n: createI18n(o), errors };
  };

  const calls: [string, (i: Core.I18n) => Promise<void>][] = [
    ["setLocale()", (i) => i.setLocale("fr")],
    ["setLocale(invalid)", (i) => i.setLocale("!!")],
    ["load()", (i) => i.load("extra")],
  ];

  it.each(calls)("an ignored failing %s with onError: reported, no unhandledRejection", async (_n, call) => {
    const { i18n, errors } = await setup(true);
    expect(await unhandled(() => void call(i18n))).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it.each(calls)("an ignored failing %s without onError: the unhandledRejection still fires", async (_n, call) => {
    const { i18n } = await setup(false);
    expect(await unhandled(() => void call(i18n))).toHaveLength(1);
  });
});
