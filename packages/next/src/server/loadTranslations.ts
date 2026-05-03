import type { I18n, TranslationValue } from "@comvi/core";
import { getI18nInstance } from "./cache";
import { ensureInitialized } from "./ensureInitialized";

/**
 * Options for loadTranslations
 */
export interface LoadTranslationsOptions {
  /**
   * Namespaces to load. Defaults to default namespace only.
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
  "[comvi/next] No loader configured. " +
  "Register one via i18n.registerLoader(...) or createNextI18n(...).use(plugin).";

const toPlainObject = (
  value: Record<string, TranslationValue>,
): Record<string, TranslationValue> => {
  // Next.js Server -> Client serialization rejects null-prototype objects.
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
 * Load translations for a locale using the configured i18n loader.
 *
 * If no loader is configured, this function returns already-cached translations
 * for requested namespaces (if any) and logs a warning.
 *
 * @example
 * ```typescript
 * const messages = await loadTranslations(locale);
 * ```
 *
 * @example
 * ```typescript
 * const messages = await loadTranslations(locale, {
 *   namespaces: ["common", "admin"],
 * });
 * ```
 */
export async function loadTranslations(
  locale: string,
  options: LoadTranslationsOptions = {},
): Promise<TranslationsResult> {
  const i18n = getI18nInstance();

  // Auto-initialize so plugins can register loaders
  await ensureInitialized(i18n);

  const defaultNs = i18n.getDefaultNamespace();
  const namespaces = options.namespaces ?? [defaultNs];
  const hasLoader = Boolean(i18n.getLoader());

  const result: TranslationsResult = {};

  for (const namespace of namespaces) {
    const cacheKey = `${locale}:${namespace}`;

    if (!i18n.hasLocale(locale, namespace) && hasLoader) {
      try {
        // Reuse core loading pipeline (events, error handling, deduplication).
        await i18n.reloadTranslations(locale, namespace);
      } catch (error) {
        const err = toError(error);
        console.warn(`[comvi/next] Failed to load ${locale}:${namespace}:`, err.message);
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
