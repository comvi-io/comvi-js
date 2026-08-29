import { inject, type Ref, type ComputedRef } from "vue";
import { I18N_INJECTION_KEY } from "../keys";
import type { VueI18n } from "../VueI18n";
import { createBoundTranslation, translationResultToString } from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  TranslateFn,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
  WrapperI18nHost,
} from "@comvi/core";

export interface UseI18nReturn<D extends DefaultTranslationParams = {}> {
  /** Always plain text; `tRaw` is the rich-text half. */
  t: TranslateFn<D, string>;

  tRaw: TranslateFn<D, TranslationResult>;

  locale: Ref<string>;

  setLocale: (locale: string) => Promise<void>;

  /** Stable identity; re-evaluates on cache mutation. */
  translationCache: ComputedRef<ReadonlyMap<string, FlattenedTranslations>>;

  isLoading: Readonly<Ref<boolean>>;

  isInitializing: Readonly<Ref<boolean>>;

  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  setFallbackLocale: (locales: string | string[]) => void;

  /** Shallow snapshot of instance-level interpolation defaults. */
  defaultParams: ComputedRef<DefaultParamsSnapshot<D>>;

  /** Replace instance-level interpolation defaults. */
  setDefaultParams: WrapperI18nHost<D>["setDefaultParams"];

  clearTranslations: (locale?: string, namespace?: string) => void;

  loadedLocales: ComputedRef<string[]>;

  activeNamespaces: ComputedRef<string[]>;

  defaultNamespace: ComputedRef<string>;

  /**
   * Re-evaluates when locale or cache changes. Call inside `setup()` (or an
   * `effectScope`) so the underlying `computed()` disposes with the scope.
   */
  hasTranslation: (
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ) => ComputedRef<boolean>;

  /** Re-evaluates when the translation cache changes. */
  hasLocale: (locale: string, namespace?: string) => ComputedRef<boolean>;

  /** Non-reactive: for use outside a reactive scope. */
  hasTranslationNow: (
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ) => boolean;

  /** Non-reactive: for use outside a reactive scope. */
  hasLocaleNow: (locale: string, namespace?: string) => boolean;

  /** Returns an unsubscribe function. */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;

  /** Routes to the configured `onError` handler. */
  reportError: WrapperI18nHost["reportError"];

  // The formatters below follow the current locale.
  formatNumber: VueI18n["formatNumber"];

  formatDate: VueI18n["formatDate"];

  formatCurrency: VueI18n["formatCurrency"];

  /** e.g. "2 hours ago", "in 3 days". */
  formatRelativeTime: VueI18n["formatRelativeTime"];

  dir: ComputedRef<"ltr" | "rtl">;

  destroy: () => void;
}

/**
 * Copied from the i18n instance as direct references. Capability members are
 * NOT here — they live behind `useI18nLoader()` / `useI18nPlugins()` — so this
 * loop only ever touches members a bare `WrapperI18nHost` really has.
 */
const PASSTHROUGH_KEYS = [
  "locale",
  "setLocale",
  "translationCache",
  "isLoading",
  "isInitializing",
  "addTranslations",
  "setFallbackLocale",
  "defaultParams",
  "setDefaultParams",
  "clearTranslations",
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
 * Must be called in a component under an installed plugin (`app.use(i18n)`).
 *
 * @param ns - Scopes `t` / `tRaw` so key lookups default to this namespace
 *   instead of the configured `defaultNs`. Nothing else is scoped:
 *   `hasTranslation` & co. take an explicit `namespace` argument.
 */
export function useI18n<D extends DefaultTranslationParams = {}>(ns?: string): UseI18nReturn<D> {
  const injected = inject(I18N_INJECTION_KEY);

  if (!injected) {
    throw new Error(
      "[i18n] useI18n must be used within a Vue app with i18n plugin installed. " +
        "Make sure you called app.use(i18n) before using this composable.",
    );
  }

  const i18n = injected as unknown as VueI18n<D, WrapperI18nHost<D>>;

  const tRaw = createBoundTranslation(i18n, ns) as UseI18nReturn<D>["tRaw"];
  const t = ((key: string, params?: TranslationParams) =>
    translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn<D>["t"];

  const result = { t, tRaw } as UseI18nReturn<D>;
  for (const k of PASSTHROUGH_KEYS) {
    (result as any)[k] = (i18n as any)[k];
  }
  return result;
}
