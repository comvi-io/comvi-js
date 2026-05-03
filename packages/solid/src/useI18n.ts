import { type Accessor } from "solid-js";
import { useI18nContextValue } from "./context";
import type {
  I18n,
  TranslationParams,
  TranslationResult,
  VirtualNode,
  FlattenedTranslations,
} from "@comvi/core";

function isVirtualNode(value: unknown): value is VirtualNode {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value.type === "text" || value.type === "element" || value.type === "fragment")
  );
}

function virtualNodeToText(node: VirtualNode): string {
  if (node.type === "text") {
    return node.text;
  }

  let text = "";
  for (const child of node.children) {
    if (typeof child === "string") {
      text += child;
      continue;
    }
    text += virtualNodeToText(child);
  }

  return text;
}

function translationResultToString(result: TranslationResult): string {
  if (typeof result === "string") {
    return result;
  }

  let text = "";
  for (const part of result) {
    if (typeof part === "string") {
      text += part;
      continue;
    }

    if (isVirtualNode(part)) {
      text += virtualNodeToText(part);
      continue;
    }

    text += String(part);
  }

  return text;
}

type BoundDefaultNamespaceParams<
  NS extends string,
  K extends string,
> = import("@comvi/core").NamespacedKeyParams<NS, K> extends never
  ? [params?: TranslationParams]
  : [params: import("@comvi/core").NamespacedKeyParams<NS, K> & TranslationParams];

type UseI18nTranslation<DefaultNS extends string | undefined> = {
  /**
   * Translation function - namespaced keys (explicit ns in params)
   */
  <NS extends import("@comvi/core").Namespaces, K extends import("@comvi/core").NamespacedKeys<NS>>(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;

  /**
   * Translation function - typed keys
   */
  <K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;

  /** Permissive overload - only active when TranslationKeys is empty */
  (key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;
} & (DefaultNS extends import("@comvi/core").Namespaces
  ? {
      /**
       * Namespace-bound shorthand when useI18n(ns) is provided.
       * Allows `t('title')` instead of `t('title', { ns: 'admin' })`.
       */
      <K extends import("@comvi/core").NamespacedKeys<DefaultNS>>(
        key: K,
        ...params: BoundDefaultNamespaceParams<DefaultNS, K>
      ): string;
    }
  : {});

type UseI18nRawTranslation<DefaultNS extends string | undefined> = {
  /**
   * Raw translation function - namespaced keys (explicit ns in params)
   */
  <NS extends import("@comvi/core").Namespaces, K extends import("@comvi/core").NamespacedKeys<NS>>(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): TranslationResult;

  /**
   * Raw translation function - typed keys
   */
  <K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;

  /** Permissive overload - only active when TranslationKeys is empty */
  (key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;
} & (DefaultNS extends import("@comvi/core").Namespaces
  ? {
      /**
       * Namespace-bound shorthand when useI18n(ns) is provided.
       * Allows `tRaw('title')` instead of `tRaw('title', { ns: 'admin' })`.
       */
      <K extends import("@comvi/core").NamespacedKeys<DefaultNS>>(
        key: K,
        ...params: BoundDefaultNamespaceParams<DefaultNS, K>
      ): TranslationResult;
    }
  : {});

export interface UseI18nReturn<DefaultNS extends string | undefined = undefined> {
  /**
   * Reactive translation function
   * Automatically re-renders when language or translations change
   * Always returns plain text.
   *
   * @example
   * ```tsx
   * const { t } = useI18n();
   *
   * // Use directly in JSX - no double call needed!
   * <p>{t('greeting')}</p>
   * <p>{t('welcome', { name: 'Alice' })}</p>
   * ```
   */
  t: UseI18nTranslation<DefaultNS>;

  /**
   * Raw translation function returning full core TranslationResult.
   * Use for advanced scenarios that need structured output.
   */
  tRaw: UseI18nRawTranslation<DefaultNS>;

  /** Current locale as a reactive accessor */
  locale: Accessor<string>;

  /** Loading state as a reactive accessor */
  isLoading: Accessor<boolean>;

  /** Initializing state as a reactive accessor */
  isInitializing: Accessor<boolean>;

  /** Initialized state as a reactive accessor */
  isInitialized: Accessor<boolean>;

  /** Translation cache revision (for triggering reactivity) */
  cacheRevision: Accessor<number>;

  // ===== Critical Methods =====

  /** Change the current locale and wait for translations to load */
  setLocale: I18n["setLocaleAsync"];

  /** Add translations programmatically at runtime */
  addTranslations: I18n["addTranslations"];

  /** Load a new namespace dynamically */
  addActiveNamespace: I18n["addActiveNamespace"];

  // ===== Advanced Methods =====

  /** Configure fallback locale chain */
  setFallbackLocale: I18n["setFallbackLocale"];

  /** Register callback for missing keys */
  onMissingKey: I18n["onMissingKey"];

  /** Register callback for load errors */
  onLoadError: I18n["onLoadError"];

  /** Clear translations from cache */
  clearTranslations: I18n["clearTranslations"];

  /** Force reload translations from loader */
  reloadTranslations: I18n["reloadTranslations"];

  // ===== Informational Methods =====

  /** Check if a locale is loaded for a namespace */
  hasLocale: I18n["hasLocale"];

  /** Check if a translation exists */
  hasTranslation: I18n["hasTranslation"];

  /** Get list of all loaded locales */
  getLoadedLocales: () => string[];

  /** Get list of active namespaces */
  getActiveNamespaces: I18n["getActiveNamespaces"];

  /** Get default namespace */
  getDefaultNamespace: I18n["getDefaultNamespace"];

  /** Get direct access to translation cache */
  getTranslationCache: () => ReadonlyMap<string, FlattenedTranslations>;

  // ===== Event Subscription =====

  /**
   * Subscribe to i18n events
   * Provides direct access to core event system for advanced use cases
   */
  on: I18n["on"];

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];

  // ===== Formatting =====

  /** Format a number using the current language locale */
  formatNumber: I18n["formatNumber"];

  /** Format a date using the current language locale */
  formatDate: I18n["formatDate"];

  /** Format a number as currency using the current language locale */
  formatCurrency: I18n["formatCurrency"];

  /** Format a relative time ("2 hours ago", "in 3 days") using the current language locale */
  formatRelativeTime: I18n["formatRelativeTime"];

  /** Text direction for the current language as a reactive accessor */
  dir: () => "ltr" | "rtl";
}

/**
 * Hook to access i18n functionality in SolidJS components
 * Must be used within a component wrapped by I18nProvider
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with reactive translation function and i18n methods
 *
 * @example Basic usage
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 *
 * function Greeting() {
 *   const { t, locale, setLocale } = useI18n();
 *
 *   return (
 *     <div>
 *       <p>{t('greeting')}</p>
 *       <p>Current locale: {locale()}</p>
 *       <button onClick={() => setLocale('fr')}>Switch to French</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With parameters
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 * import { createSignal } from 'solid-js';
 *
 * function Counter() {
 *   const { t } = useI18n();
 *   const [count, setCount] = createSignal(5);
 *
 *   return <p>{t('items', { count: count() })}</p>;
 * }
 * ```
 *
 * @example Dynamic namespace loading
 * ```tsx
 * import { useI18n } from '@comvi/solid';
 * import { createSignal } from 'solid-js';
 *
 * function AdminPanel() {
 *   const { t, addActiveNamespace, isLoading } = useI18n();
 *   const [isAdminLoaded, setIsAdminLoaded] = createSignal(false);
 *
 *   async function loadAdmin() {
 *     await addActiveNamespace('admin');
 *     setIsAdminLoaded(true);
 *   }
 *
 *   return (
 *     <Show when={!isLoading()} fallback={<p>Loading...</p>}>
 *       <Show when={isAdminLoaded()} fallback={<button onClick={loadAdmin}>Load Admin</button>}>
 *         <p>{t('dashboard', { ns: 'admin' })}</p>
 *       </Show>
 *     </Show>
 *   );
 * }
 * ```
 */
export function useI18n<DefaultNS extends string | undefined = undefined>(
  ns?: DefaultNS,
): UseI18nReturn<DefaultNS> {
  const ctx = useI18nContextValue();

  /**
   * Reactive raw translation function.
   * When called within a reactive context (JSX, createMemo, createEffect),
   * it automatically tracks language and cache changes.
   */
  const tRaw = ((key: string, params?: TranslationParams): TranslationResult => {
    // Access signals to establish reactive dependencies
    // This works because SolidJS tracks signal access in reactive contexts
    ctx.signals.locale();
    ctx.signals.cacheRevision();
    if (ns === undefined) {
      ctx.signals.defaultNamespace();
    }

    // No params: preserve core fast-path and avoid unnecessary object allocation.
    if (params == null) {
      if (ns === undefined) {
        return ctx.i18n.tRaw(key as never);
      }
      return ctx.i18n.tRaw(key as never, { ns } as TranslationParams);
    }

    // User explicitly provided namespace - never override it.
    if (params.ns !== undefined || ns === undefined) {
      return ctx.i18n.tRaw(key as never, params as TranslationParams);
    }

    // Merge default namespace only when needed.
    return ctx.i18n.tRaw(key as never, { ns, ...params } as TranslationParams);
  }) as UseI18nRawTranslation<DefaultNS>;

  /**
   * Reactive translation function that always returns plain text.
   * Structured rich-text output should use `tRaw()` or `<T />`.
   */
  const t = ((key: string, params?: TranslationParams): string => {
    return translationResultToString(tRaw(key as never, params as never));
  }) as UseI18nTranslation<DefaultNS>;

  return {
    t,
    tRaw,

    // To support destructuring while maintaining hot-swap capability,
    // we return wrapper accessors instead of returning the getters directly.
    // This ensures ctx.signals.* is called at read time, not at destructure time.
    locale: () => ctx.signals.locale(),
    isLoading: () => ctx.signals.isLoading(),
    isInitializing: () => ctx.signals.isInitializing(),
    isInitialized: () => ctx.signals.isInitialized(),
    cacheRevision: () => ctx.signals.cacheRevision(),

    // Bind all methods dynamically so they always use the current i18n instance.
    // Functions are returned directly to support destructuring safely.
    setLocale: (...args) => ctx.i18n.setLocaleAsync(...args),
    addTranslations: (...args) => ctx.i18n.addTranslations(...args),
    addActiveNamespace: (...args) => ctx.i18n.addActiveNamespace(...args),
    setFallbackLocale: (...args) => ctx.i18n.setFallbackLocale(...args),
    onMissingKey: (...args) => ctx.i18n.onMissingKey(...args),
    onLoadError: (...args) => ctx.i18n.onLoadError(...args),
    clearTranslations: (...args) => ctx.i18n.clearTranslations(...args),
    reloadTranslations: (...args) => ctx.i18n.reloadTranslations(...args),
    hasLocale: (...args) => ctx.i18n.hasLocale(...args),
    hasTranslation: (...args) => ctx.i18n.hasTranslation(...args),
    getLoadedLocales: () => ctx.i18n.getLoadedLocales(),
    getActiveNamespaces: () => ctx.i18n.getActiveNamespaces(),
    getDefaultNamespace: () => ctx.i18n.getDefaultNamespace(),
    getTranslationCache: () => ctx.i18n.translationCache.getInternalMap(),
    on: (...args) => ctx.i18n.on(...args),
    reportError: (...args) => ctx.i18n.reportError(...args),
    formatNumber: (...args) => ctx.i18n.formatNumber(...args),
    formatDate: (...args) => ctx.i18n.formatDate(...args),
    formatCurrency: (...args) => ctx.i18n.formatCurrency(...args),
    formatRelativeTime: (...args) => ctx.i18n.formatRelativeTime(...args),
    // Read the locale signal to establish reactive dependency, then delegate
    // to i18n.dir which is kept in sync via core's localeChanged event
    dir: () => {
      void ctx.signals.locale();
      return ctx.i18n.dir;
    },
  };
}
