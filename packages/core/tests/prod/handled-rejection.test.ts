/**
 * The production project (`__DEV__` false): with `onError`, an ignored `setLocale()` / `load()`
 * that fails raises no `unhandledRejection`; without it, the rejection stays globally visible.
 * `unhandled()` sets Vitest's own listeners aside meanwhile (see
 * tests/instance/handled-rejection.test.ts).
 */
import { describe, expect, it } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n, type I18n, type I18nOptions } from "../../src/instance";

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
const setup = (withOnError: boolean) => {
  const errors: I18nError[] = [];
  const o: I18nOptions = {
    locale: "en",
    catalogs: { default: { en: { a: "A" } } },
    loader: (l, n) => (l == "fr" || n == "extra" ? Promise.reject(boom) : Promise.resolve({})),
  };
  if (withOnError) o.onError = (e) => void errors.push(e);
  return { i18n: createI18n(o), errors };
};

describe.each<[string, (i: I18n) => Promise<void>]>([
  ["setLocale()", (i) => i.setLocale("fr")],
  ["setLocale(invalid)", (i) => i.setLocale("!!")],
  ["load()", (i) => i.load("extra")],
])("production: an ignored failing %s", (_name, call) => {
  it("with onError: reported, no unhandledRejection", async () => {
    const { i18n, errors } = setup(true);
    expect(await unhandled(() => void call(i18n))).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("without onError: the unhandledRejection still fires", async () => {
    const { i18n } = setup(false);
    expect(await unhandled(() => void call(i18n))).toHaveLength(1);
  });
});
