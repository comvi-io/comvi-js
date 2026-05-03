import type { TranslationKeys, TranslationResult, TranslationParams, ParamsArg } from "../types";

/**
 * Interface for any i18n instance that has a compatible translation method.
 * This allows createBoundTranslation to work with both I18n and framework-specific wrappers.
 */
export interface I18nTranslatable {
  t<K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K> : [params?: TranslationParams]
  ): string | TranslationResult;
  tRaw?<K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K> : [params?: TranslationParams]
  ): TranslationResult;
}

/**
 * Creates a translation function with optional namespace binding.
 *
 * This utility simplifies framework binding implementations by extracting
 * the complex namespace merging logic into a single reusable function.
 *
 * @param i18n - Any i18n instance with a compatible t() method
 * @param ns - Optional namespace to bind to all translations
 * @returns A translation function with the same signature as i18n.t
 *
 * @example Without namespace binding
 * ```typescript
 * const t = createBoundTranslation(i18n);
 * t('hello'); // Uses default namespace from i18n config
 * ```
 *
 * @example With namespace binding
 * ```typescript
 * const t = createBoundTranslation(i18n, 'dashboard');
 * t('title'); // Automatically uses 'dashboard' namespace
 * t('subtitle', { ns: 'common' }); // Can still override namespace
 * ```
 */
export function createBoundTranslation(
  i18n: I18nTranslatable,
  ns?: string,
): <K extends keyof TranslationKeys | (string & Record<never, never>)>(
  key: K,
  ...params: K extends keyof TranslationKeys ? ParamsArg<K> : [params?: TranslationParams]
) => TranslationResult {
  const translateRaw = i18n.tRaw?.bind(i18n) ?? i18n.t.bind(i18n);

  if (!ns) {
    return translateRaw as <K extends keyof TranslationKeys | (string & Record<never, never>)>(
      key: K,
      ...params: K extends keyof TranslationKeys ? ParamsArg<K> : [params?: TranslationParams]
    ) => TranslationResult;
  }

  return <K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K> : [params?: TranslationParams]
  ): TranslationResult => {
    const userParams = params[0];

    // No user params: bind namespace with a fresh object to avoid cross-call mutation leaks.
    if (userParams == null) {
      return translateRaw(key as any, { ns } as any) as TranslationResult;
    }

    // User explicitly provided ns - don't override, use their params as-is
    if (userParams.ns !== undefined) {
      return translateRaw(key as any, userParams as any) as TranslationResult;
    }

    // SLOW PATH: Must merge ns with user params (rare case)
    return translateRaw(key as any, { ns, ...userParams } as any) as TranslationResult;
  };
}
