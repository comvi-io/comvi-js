import { useMemo } from "react";
import { useI18nContext } from "./I18nProvider";
import { createBoundTranslation } from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  VirtualNode,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  I18n,
} from "@comvi/core";

import { isVirtualNode } from "./utils";

type ReactElementLike = {
  $$typeof: unknown;
  props?: {
    children?: unknown;
  };
};

function isReactElementLike(value: unknown): value is ReactElementLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "$$typeof" in value &&
    "props" in value &&
    typeof (value as { props?: unknown }).props === "object"
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

function reactNodeToText(node: unknown): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    let text = "";
    for (const item of node) {
      text += reactNodeToText(item);
    }
    return text;
  }
  if (isVirtualNode(node)) {
    return virtualNodeToText(node);
  }
  if (isReactElementLike(node)) {
    return reactNodeToText(node.props?.children);
  }
  return String(node);
}

function translationResultToString(result: TranslationResult): string {
  if (typeof result === "string") {
    return result;
  }

  let text = "";
  for (const part of result as Array<unknown>) {
    if (typeof part === "string") {
      text += part;
      continue;
    }
    if (isVirtualNode(part)) {
      text += virtualNodeToText(part);
      continue;
    }
    if (isReactElementLike(part)) {
      text += reactNodeToText(part.props?.children);
      continue;
    }
    text += String(part);
  }
  return text;
}

/** Methods bound directly from i18n instance */
const BIND_METHODS = [
  "addTranslations",
  "addActiveNamespace",
  "setFallbackLocale",
  "onLoadError",
  "clearTranslations",
  "reloadTranslations",
  "hasLocale",
  "hasTranslation",
  "getLoadedLocales",
  "getActiveNamespaces",
  "getDefaultNamespace",
  "on",
  "reportError",
  "formatNumber",
  "formatDate",
  "formatCurrency",
  "formatRelativeTime",
] as const;

export interface UseI18nReturn {
  /**
   * Translation function - namespaced keys (when ns is provided)
   *
   * Always returns plain text. If core returns structured output
   * (e.g. VirtualNode arrays), it's flattened to string.
   */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;

  /**
   * Translation function - typed keys
   *
   * Always returns plain text.
   * For rich-text/tag interpolation rendering, use `tRaw()` or the `<T>` component instead.
   */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;

  /** Permissive overload - only active when TranslationKeys is empty */
  t(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;

  /**
   * Raw translation function returning full core TranslationResult.
   * Use this for advanced scenarios that need structured output.
   */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): TranslationResult;
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;
  tRaw(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;

  /** Current locale */
  locale: string;

  /** Translation cache */
  translationCache: ReadonlyMap<string, FlattenedTranslations>;

  /** Loading state */
  isLoading: boolean;

  /** Initializing state */
  isInitializing: boolean;

  // ===== Critical Methods =====

  /** Change the current locale and wait for translations to load */
  setLocale: (locale: string) => Promise<void>;

  /** Add translations programmatically at runtime */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /** Load a new namespace dynamically */
  addActiveNamespace: (namespace: string) => Promise<void>;

  // ===== Advanced Methods =====

  /** Configure fallback locale chain */
  setFallbackLocale: (locales: string | string[]) => void;

  /** Register callback for missing keys */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => string | void,
  ) => () => void;

  /** Register callback for load errors */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;

  /** Clear translations from cache */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /** Force reload translations from loader */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

  // ===== Informational Methods =====

  /** Check if a locale is loaded for a namespace */
  hasLocale: (locale: string, namespace?: string) => boolean;

  /** Check if a translation exists */
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;

  /** Get list of all loaded locale codes */
  getLoadedLocales: () => string[];

  /** Get list of active namespaces */
  getActiveNamespaces: () => string[];

  /** Get default namespace */
  getDefaultNamespace: () => string;

  // ===== Formatting =====

  /** Format a number using the current language locale */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;

  /** Format a date using the current language locale */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;

  /** Format a number as currency using the current language locale */
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;

  /** Format a relative time ("2 hours ago", "in 3 days") using the current language locale */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;

  /** Text direction for the current language ("ltr" or "rtl") */
  dir: "ltr" | "rtl";

  // ===== Event Subscription =====

  /**
   * Subscribe to i18n events
   * Provides direct access to core event system for advanced use cases
   *
   * @example
   * ```tsx
   * import { useI18n } from '@comvi/react';
   * import { useEffect } from 'react';
   *
   * function MyComponent() {
   *   const { on } = useI18n();
   *
   *   useEffect(() => {
   *     const unsubscribe = on('localeChanged', ({ from, to }) => {
   *       analytics.track('locale_changed', { from, to });
   *     });
   *
   *     return () => unsubscribe();
   *   }, [on]);
   *
   *   return <div>...</div>;
   * }
   * ```
   */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];
}

/**
 * Hook to access i18n functionality in React components
 * Must be used within an I18nProvider
 *
 * @param ns - Optional namespace to scope translations to
 * @returns Object with translation function, reactive state, and i18n methods
 *
 * @example Basic usage
 * ```tsx
 * import { useI18n } from '@comvi/react';
 *
 * function MyComponent() {
 *   const { t, locale } = useI18n();
 *
 *   return (
 *     <div>
 *       <p>{t('greeting')}</p>
 *       <p>Current locale: {locale}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Dynamic namespace loading
 * ```tsx
 * import { useI18n } from '@comvi/react';
 * import { useState } from 'react';
 *
 * function Dashboard() {
 *   const { t, addActiveNamespace, isLoading } = useI18n();
 *   const [showDashboard, setShowDashboard] = useState(false);
 *
 *   const loadDashboard = async () => {
 *     await addActiveNamespace('dashboard');
 *     setShowDashboard(true);
 *   };
 *
 *   return (
 *     <div>
 *       {!showDashboard ? (
 *         <button onClick={loadDashboard}>
 *           Load Dashboard
 *         </button>
 *       ) : (
 *         <div>{t('title', { ns: 'dashboard' })}</div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Adding translations at runtime
 * ```tsx
 * import { useI18n } from '@comvi/react';
 * import { useEffect } from 'react';
 *
 * function MyComponent() {
 *   const { t, addTranslations } = useI18n();
 *
 *   useEffect(() => {
 *     addTranslations({
 *       en: { dynamic: 'Dynamic value' },
 *       fr: { dynamic: 'Valeur dynamique' }
 *     });
 *   }, [addTranslations]);
 *
 *   return <div>{t('dynamic')}</div>;
 * }
 * ```
 *
 * @remarks
 * Re-render behavior: Components using this hook will re-render when any
 * reactive state (locale, translations, isLoading) changes. This is
 * expected and ensures your UI stays in sync with the i18n state.
 *
 * For performance optimization, use React.memo() on components that should
 * skip re-renders when their props haven't changed.
 */
export function useI18n(ns?: string): UseI18nReturn {
  const { i18n, locale, translationCache, isLoading, isInitializing } = useI18nContext();

  // Raw bound translation. Needed by <T> and advanced integrations.
  const tRaw = useMemo(() => createBoundTranslation(i18n, ns) as UseI18nReturn["tRaw"], [i18n, ns]);

  // Text-only translation helper for regular UI copy.
  const t = useMemo(
    () =>
      ((key: string, params?: TranslationParams) =>
        translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn["t"],
    [tRaw],
  );

  // Memoize ALL methods for referential stability in useEffect dependency arrays
  const boundMethods = useMemo(() => {
    const methods = {} as Record<string, unknown>;

    // Bind core methods directly
    for (const m of BIND_METHODS) {
      methods[m] = (i18n[m] as (...a: any[]) => any).bind(i18n);
    }

    // Special wrappers
    methods.setLocale = (loc: string) => i18n.setLocaleAsync(loc);
    methods.onMissingKey = (
      callback: (key: string, locale: string, namespace: string) => string | void,
    ) =>
      i18n.onMissingKey((key, loc, ns) => {
        const result = callback(key, loc, ns);
        return typeof result === "string" || result === undefined ? result : String(result);
      });

    return methods;
  }, [i18n]);

  return {
    t,
    tRaw,
    locale,
    translationCache,
    isLoading,
    isInitializing,
    dir: i18n.dir,
    ...(boundMethods as Omit<
      UseI18nReturn,
      "t" | "tRaw" | "locale" | "translationCache" | "isLoading" | "isInitializing" | "dir"
    >),
  };
}
