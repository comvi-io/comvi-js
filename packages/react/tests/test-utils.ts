import { act } from "@testing-library/react";
import type { I18n } from "../src";

/**
 * Helper to change locale with proper act() wrapping
 * Prevents "An update to I18nProvider inside a test was not wrapped in act(...)" warnings
 *
 * @example
 * await setLocale(i18n, 'fr');
 */
export const setLocale = async (i18n: I18n, locale: string) => {
  await act(async () => {
    await i18n.setLocaleAsync(locale);
  });
};

/**
 * Helper to add translations with proper act() wrapping
 * Prevents "An update to I18nProvider inside a test was not wrapped in act(...)" warnings
 *
 * @example
 * await addTranslations(i18n, { en: { key: 'value' } });
 */
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
