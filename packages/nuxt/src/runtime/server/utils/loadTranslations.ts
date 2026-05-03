import type { I18n, TranslationValue } from "@comvi/core";
import type { H3Event } from "h3";
import { getRequestI18n } from "./request-i18n";

/**
 * Options for loadTranslations
 */
export interface LoadTranslationsOptions {
  /**
   * Namespaces to load (defaults to default namespace)
   */
  namespaces?: string[];
}

/**
 * Translations result keyed by "locale:namespace"
 */
export type TranslationsResult = Record<string, Record<string, TranslationValue>>;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
const noLoaderWarnings = new WeakSet<I18n>();
const NO_LOADER_WARNING_MESSAGE =
  "[@comvi/nuxt] No loader configured. Register one in comvi.setup via i18n.use(...).";

const toPlainObject = (
  value: Record<string, TranslationValue>,
): Record<string, TranslationValue> => {
  // Server -> client payload serialization rejects null-prototype objects.
  return Object.fromEntries(Object.entries(value)) as Record<string, TranslationValue>;
};

const warnNoLoaderConfigured = (i18n: I18n): void => {
  if (noLoaderWarnings.has(i18n)) {
    return;
  }
  noLoaderWarnings.add(i18n);
  console.warn(NO_LOADER_WARNING_MESSAGE);
};

/**
 * Load translations for SSR/SSG using the configured i18n loader pipeline.
 */
export async function loadTranslations(
  event: H3Event,
  locale: string,
  options: LoadTranslationsOptions = {},
): Promise<TranslationsResult> {
  const i18n = await getRequestI18n(event, locale);
  const defaultNs = i18n.getDefaultNamespace();
  const namespaces = options.namespaces ?? [defaultNs];
  const hasLoader = Boolean(i18n.getLoader());
  const result: TranslationsResult = {};

  for (const namespace of namespaces) {
    const cacheKey = `${locale}:${namespace}`;

    if (!i18n.hasLocale(locale, namespace) && hasLoader) {
      try {
        await i18n.reloadTranslations(locale, namespace);
      } catch (error) {
        const err = toError(error);
        console.warn(`[@comvi/nuxt] Failed to load ${locale}:${namespace}:`, err.message);
      }
    }

    if (i18n.hasLocale(locale, namespace)) {
      const translations = i18n.getTranslations(locale, namespace) as Record<
        string,
        TranslationValue
      >;
      result[cacheKey] = toPlainObject(translations);
    }
  }

  if (!hasLoader && Object.keys(result).length === 0) {
    warnNoLoaderConfigured(i18n);
  }

  return result;
}
