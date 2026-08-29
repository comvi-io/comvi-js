import { act } from "@testing-library/react";
import type { I18n } from "../src";

/** act()-wrapped, so the provider update does not warn. */
export const setLocale = async (i18n: I18n, locale: string) => {
  await act(async () => {
    await i18n.setLocaleAsync(locale);
  });
};

/** act()-wrapped, so the provider update does not warn. */
export const addTranslations = async (
  i18n: I18n,
  translations: Parameters<I18n["addTranslations"]>[0],
) => {
  await act(async () => {
    i18n.addTranslations(translations);
  });
};

export const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * The package's ONE deterministic flush. `turns` is the number of microtask
 * turns the code under test needs to settle — a stated fact rather than a
 * copy-pasted `await Promise.resolve()` chain whose count nobody can justify.
 */
export const flushMicrotasks = async (turns = 1) => {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
};

/** `flushMicrotasks` inside `act()`, so effects scheduled by the drained work commit. */
export const flushEffects = (turns = 1) =>
  act(async () => {
    await flushMicrotasks(turns);
  });
