import type {
  TranslationKeys,
  TranslationResult,
  TranslationParams,
  ParamsArg,
  DefaultTranslationParams,
} from "../types";

/** Structural: satisfied by `I18n` and by the framework wrappers alike. */
export interface I18nTranslatable<D extends DefaultTranslationParams = {}> {
  t<K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K, D> : [params?: TranslationParams]
  ): string | TranslationResult;
  tRaw?<K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K, D> : [params?: TranslationParams]
  ): TranslationResult;
}

/**
 * A translation function with an optional namespace bound in. Prefers `tRaw`
 * when the host has one, so structured results survive.
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
export function createBoundTranslation<D extends DefaultTranslationParams = {}>(
  i18n: I18nTranslatable<D>,
  ns?: string,
): <K extends keyof TranslationKeys | (string & Record<never, never>)>(
  key: K,
  ...params: K extends keyof TranslationKeys ? ParamsArg<K, D> : [params?: TranslationParams]
) => TranslationResult {
  const translateRaw = i18n.tRaw?.bind(i18n) ?? i18n.t.bind(i18n);

  if (!ns) {
    return translateRaw as <K extends keyof TranslationKeys | (string & Record<never, never>)>(
      key: K,
      ...params: K extends keyof TranslationKeys ? ParamsArg<K, D> : [params?: TranslationParams]
    ) => TranslationResult;
  }

  return <K extends keyof TranslationKeys | (string & Record<never, never>)>(
    key: K,
    ...params: K extends keyof TranslationKeys ? ParamsArg<K, D> : [params?: TranslationParams]
  ): TranslationResult => {
    const userParams = params[0];

    // A fresh object per call: a shared one would leak mutations across calls.
    if (userParams == null) {
      return translateRaw(key as any, { ns } as any) as TranslationResult;
    }

    // An explicit `ns` from the caller is never overridden.
    if (userParams.ns !== undefined) {
      return translateRaw(key as any, userParams as any) as TranslationResult;
    }

    // Slow path — a merge allocates.
    return translateRaw(key as any, { ns, ...userParams } as any) as TranslationResult;
  };
}
