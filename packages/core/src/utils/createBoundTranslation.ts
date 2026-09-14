import type {
  TranslationResult,
  AcceptedKey,
  ArgsFor,
  NamespacedKeys,
  Namespaces,
  DefaultTranslationParams,
} from "../types";

/**
 * Structural: satisfied by `I18n` and by the framework wrappers alike, so it
 * narrows through the same {@link AcceptedKey} / {@link ArgsFor} pair they do.
 */
export interface I18nTranslatable<D extends DefaultTranslationParams = {}> {
  t<
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
  ): string | TranslationResult;
  tRaw?<
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
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
): <
  K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
  N extends Namespaces = never,
>(
  key: K,
  ...params: ArgsFor<K, undefined, D, N>
) => TranslationResult {
  const translateRaw = i18n.tRaw?.bind(i18n) ?? i18n.t.bind(i18n);

  if (!ns) {
    return translateRaw as <
      K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
      N extends Namespaces = never,
    >(
      key: K,
      ...params: ArgsFor<K, undefined, D, N>
    ) => TranslationResult;
  }

  return <
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
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
