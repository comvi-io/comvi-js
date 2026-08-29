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
