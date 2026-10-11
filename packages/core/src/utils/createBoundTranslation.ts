import type {
  TranslationResult,
  AcceptedKey,
  ArgsFor,
  NamespaceBoundTranslateFn,
  NamespacedKeys,
  Namespaces,
  DefaultTranslationParams,
  TranslationParams,
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
 * when the instance has one, so structured results survive.
 *
 * The namespace is threaded into the RETURN type, so the result narrows to
 * that namespace's keys exactly as a wrapper's `useI18n(ns)` does — it is the
 * same {@link NamespaceBoundTranslateFn}. Bind the namespace with an argument
 * TypeScript can read as a literal (a string literal, or a `const`-declared
 * one); a `string` variable leaves the result unbound, which is the loose
 * behaviour a runtime namespace always had.
 *
 * @example Without namespace binding
 * ```typescript
 * const t = createBoundTranslation(i18n);
 * t('hello'); // Uses default namespace from i18n config
 * ```
 *
 * @example With namespace binding
 * ```typescript
 * const t = createBoundTranslation(i18n, 'admin');
 * t('dashboard'); // 'admin:dashboard' — the prefix is implied
 * t('checkout', { ns: 'shop' }); // Can still override namespace
 * ```
 */
export function createBoundTranslation<
  D extends DefaultTranslationParams = {},
  NS extends string | undefined = undefined,
>(i18n: I18nTranslatable<D>, ns?: NS): NamespaceBoundTranslateFn<NS, D, TranslationResult> {
  const translateRaw = i18n.tRaw?.bind(i18n) ?? i18n.t.bind(i18n);

  if (!ns) {
    return translateRaw as NamespaceBoundTranslateFn<NS, D, TranslationResult>;
  }

  const bound = <
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
  ): TranslationResult => {
    // `ArgsFor` cannot resolve while `K` is still a type parameter, so the
    // tuple element reads as `{}` here. The runtime shape is a params object
    // or nothing, which is what every branch below treats it as.
    const userParams = params[0] as TranslationParams | undefined;

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

  return bound as NamespaceBoundTranslateFn<NS, D, TranslationResult>;
}
