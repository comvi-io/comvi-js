import { inject, type Ref, type ComputedRef } from "vue";
import { I18N_INJECTION_KEY } from "../keys";
import type { VueI18n } from "../VueI18n";
import { createBoundTranslation } from "@comvi/core";
import { translationResultToString } from "../utils";
import type {
  TranslationParams,
  TranslationResult,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  I18n,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
} from "@comvi/core";

export interface UseI18nReturn<D extends DefaultTranslationParams = {}> {
  /** Translation function - namespaced keys (when ns is provided). Always returns plain text. */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K, D>
  ): string;

  /** Translation function - typed keys (default namespace only, use ns option for others). */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K, D>
  ): string;

  /** Permissive overload - only active when TranslationKeys is empty */
  t(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;

  /** Raw translation result for rich text renderers and advanced integrations. */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K, D>
  ): TranslationResult;

  /** Raw translation result for typed keys. */
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K, D>
  ): TranslationResult;

  /** Raw translation result for permissive keys. */
  tRaw(key: import("@comvi/core").PermissiveKey, params?: TranslationParams): TranslationResult;

  /** Current locale (reactive Vue Ref) */
  locale: Ref<string>;

  /** Set locale asynchronously */
  setLocale: (locale: string) => Promise<void>;

  /** Translation cache as a reactive ComputedRef (stable identity, re-evaluates on cache mutation) */
  translationCache: ComputedRef<ReadonlyMap<string, FlattenedTranslations>>;

  /** Loading state (readonly reactive Vue Ref) */
  isLoading: Readonly<Ref<boolean>>;

  /** Initializing state (readonly reactive Vue Ref) */
  isInitializing: Readonly<Ref<boolean>>;

  /** Add translations programmatically at runtime */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /** Load a new namespace dynamically */
  addActiveNamespace: (namespace: string) => Promise<void>;

  /** Configure fallback locale chain */
  setFallbackLocale: (locales: string | string[]) => void;

  /** Reactive shallow snapshot of instance-level interpolation defaults. */
  defaultParams: ComputedRef<DefaultParamsSnapshot<D>>;

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: I18n<D>["setDefaultParams"];

  /** Register callback for missing keys */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ) => () => void;

  /** Register callback for load errors */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;

  /** Clear translations from cache */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /** Force reload translations from loader */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

  /** Reactive list of all loaded locale codes */
  loadedLocales: ComputedRef<string[]>;

  /** Reactive list of active namespaces */
  activeNamespaces: ComputedRef<string[]>;

  /** Reactive default namespace */
  defaultNamespace: ComputedRef<string>;

  /**
   * Reactive check for translation existence. Returns a ComputedRef<boolean>
   * that re-evaluates when locale or cache changes. Call inside `setup()`
   * (or an `effectScope`) so the underlying `computed()` disposes with the scope.
   */
  hasTranslation: (
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ) => ComputedRef<boolean>;

  /**
   * Reactive check for locale availability. Returns a ComputedRef<boolean>
   * that re-evaluates when the translation cache changes.
   */
  hasLocale: (locale: string, namespace?: string) => ComputedRef<boolean>;

  /** Imperative (non-reactive) translation-existence check — plain boolean, for use outside a reactive scope. */
  hasTranslationNow: (
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ) => boolean;

  /** Imperative (non-reactive) locale-availability check — returns a plain `boolean`. */
  hasLocaleNow: (locale: string, namespace?: string) => boolean;

  /** Subscribe to i18n events */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Report an error to the configured onError handler */
  reportError: I18n["reportError"];

  /** Format a number using the current language locale */
  formatNumber: VueI18n["formatNumber"];

  /** Format a date using the current language locale */
  formatDate: VueI18n["formatDate"];

  /** Format a number as currency using the current language locale */
  formatCurrency: VueI18n["formatCurrency"];

  /** Format a relative time ("2 hours ago", "in 3 days") using the current language locale */
  formatRelativeTime: VueI18n["formatRelativeTime"];

  /** Text direction for the current language, as a reactive computed ref */
  dir: ComputedRef<"ltr" | "rtl">;

  /** Cleanup resources (call when i18n instance is no longer needed) */
  destroy: () => void;
}

/** Keys copied from the i18n instance as direct references */
const PASSTHROUGH_KEYS = [
  "locale",
  "setLocale",
  "translationCache",
  "isLoading",
  "isInitializing",
  "addTranslations",
  "addActiveNamespace",
  "setFallbackLocale",
  "defaultParams",
  "setDefaultParams",
  "onMissingKey",
  "onLoadError",
  "clearTranslations",
  "reloadTranslations",
  "hasLocale",
  "hasTranslation",
  "hasLocaleNow",
  "hasTranslationNow",
  "loadedLocales",
  "activeNamespaces",
  "defaultNamespace",
  "on",
  "reportError",
  "formatNumber",
  "formatDate",
  "formatCurrency",
  "formatRelativeTime",
  "dir",
  "destroy",
] as const;

/**
 * Vue composable to access the i18n instance.
 * Must be called within a component that has access to the i18n plugin
 * (i.e. after `app.use(i18n)`).
 *
 * @param ns - Optional namespace to scope the returned `t` / `tRaw` functions to.
 *             When provided, key lookups default to this namespace instead of the
 *             configured `defaultNs`. Other returned methods (e.g. `hasTranslation`,
 *             `addActiveNamespace`) are NOT scoped — they accept explicit `namespace`
 *             arguments where applicable.
 * @returns Object with translation function, reactive state, and i18n methods
 */
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  const injected = inject(I18N_INJECTION_KEY);

  if (!injected) {
    throw new Error(
      "[i18n] useI18n must be used within a Vue app with i18n plugin installed. " +
        "Make sure you called app.use(i18n) before using this composable.",
    );
  }

  const i18n = injected as VueI18n<D>;

  const tRaw = createBoundTranslation(i18n, ns) as UseI18nReturn<D>["tRaw"];
  const t = ((key: string, params?: TranslationParams) =>
    translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn<D>["t"];

  const result = { t, tRaw } as UseI18nReturn<D>;
  for (const k of PASSTHROUGH_KEYS) {
    (result as any)[k] = (i18n as any)[k];
  }
  return result;
}
