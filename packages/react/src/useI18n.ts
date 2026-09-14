import { useContext, useMemo } from "react";
import { LocaleContext, useI18nInstance, useStoreRevision } from "./I18nProvider";
import {
  createBoundTranslation,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
  isVirtualNode,
} from "@comvi/core";
import type {
  TranslationParams,
  TranslationResult,
  NamespaceBoundTranslateFn,
  VirtualNode,
  FlattenedTranslations,
  TranslationValue,
  I18nEvent,
  I18nEventData,
  WrapperI18nHost,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
} from "@comvi/core";

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
  // PERF GUARD, not dead code: every plain-string t() call lands here, and
  // iterating a string as parts costs ~72x (measured 11ns -> 794ns per call).
  // Mutation-equivalent by output, kept for the hot path — see the registry
  // entry for useI18n.ts "if (typeof result === \"string\")".
  if (typeof result === "string") {
    return result;
  }
  let text = "";
  for (const part of result as Array<unknown>) {
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

/**
 * Generic in `D`, like the other three wrappers: a non-generic alias collapses
 * `D` to `{}` for every member reached through it, which silently un-typed
 * `setDefaultParams` (see `tests/types/default-params.test-d.ts`).
 */
type Host<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

/**
 * No loader or plugin-host member is here — `addActiveNamespace(s)`,
 * `removeActiveNamespace(s)`, `reloadTranslations`, `onLoadError` and
 * `onMissingKey` among them. They belong to capabilities a base host does not
 * have, so binding them eagerly would crash at bind time. `useI18nLoader()` /
 * `useI18nPlugins()` acquire them instead.
 *
 * `hasTranslation` is not here either: a raw bind resolves against the mutable
 * instance locale, so it is wrapped below to default to the render-time locale
 * like `t` does.
 */
const BIND_METHODS = [
  "addTranslations",
  "setFallbackLocale",
  "setDefaultParams",
  "clearTranslations",
  "hasLocale",
  "getLoadedLocales",
  "getActiveNamespaces",
  "getDefaultNamespace",
  "on",
  "reportError",
] as const;

/**
 * The host-only translation surface. Loader and plugin-host members are not
 * part of it — they do not exist on a base host, so a type promising them
 * would be lying; `useI18nLoader()` / `useI18nPlugins()` acquire those.
 *
 * `NS` is the namespace `useI18n(ns)` bound, and narrows `t` / `tRaw` through
 * core's `NamespaceBoundTranslateFn` exactly as the other three wrappers do.
 */
export interface UseI18nReturn<
  D extends DefaultTranslationParams = {},
  NS extends string | undefined = undefined,
> {
  /** Translate a key. Returns plain text; for rich-text use `tRaw()` or `<T>`. */
  t: NamespaceBoundTranslateFn<NS, D, string>;

  /** The full core `TranslationResult`: a string or a structured array. */
  tRaw: NamespaceBoundTranslateFn<NS, D, TranslationResult>;

  locale: string;
  translationCache: ReadonlyMap<string, FlattenedTranslations>;
  isLoading: boolean;
  isInitializing: boolean;
  isInitialized: boolean;

  /** Core's translation-cache revision for this render; changes on cache mutation. */
  cacheRevision: number;

  /** Change the current locale and wait for translations to load. */
  setLocale: (locale: string) => Promise<void>;
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  setFallbackLocale: (locales: string | string[]) => void;
  /** Current interpolation defaults for this render (shallow snapshot). */
  defaultParams: DefaultParamsSnapshot<D>;
  /** Replace instance-level interpolation defaults. */
  setDefaultParams: Host<D>["setDefaultParams"];
  clearTranslations: (locale?: string, namespace?: string) => void;

  hasLocale: (locale: string, namespace?: string) => boolean;
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;
  getLoadedLocales: () => string[];
  getActiveNamespaces: () => string[];
  getDefaultNamespace: () => string;

  // The formatters below default to the render-time locale; the trailing
  // `locale` overrides it for one call, as in the other three bindings.
  formatNumber: (value: number, options?: Intl.NumberFormatOptions, locale?: string) => string;
  formatDate: (
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
    locale?: string,
  ) => string;
  formatCurrency: (
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
    locale?: string,
  ) => string;
  /** e.g. "2 hours ago". */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
    locale?: string,
  ) => string;

  dir: "ltr" | "rtl";

  /** Subscribe to i18n events. Returns an unsubscribe function. */
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;
  /** Report an error to the configured onError handler. */
  reportError: Host["reportError"];

  // D″ tombstones. These four members LEFT `useI18n()` in 0.5 for
  // `useI18nLoader()` / `useI18nPlugins()`. Declaring each optional and
  // `never` keeps the name visible — struck through in autocomplete, with the
  // acquisition in the tooltip — while any use stays a type error. Type-only:
  // the object `useI18n()` returns never carries these keys, in any build.
  /** @deprecated Moved in 0.5. Acquire it: `const { addActiveNamespace } = useI18nLoader()`. */
  addActiveNamespace?: never;
  // Declared optional, so `if (bag.addActiveNamespace)` compiles and is
  // always false — acquire it from `useI18nLoader()` instead.
  /** @deprecated Moved in 0.5. Acquire it: `const { reloadTranslations } = useI18nLoader()`. */
  reloadTranslations?: never;
  // Declared optional, so `if (bag.reloadTranslations)` compiles and is
  // always false — acquire it from `useI18nLoader()` instead.
  /** @deprecated Moved in 0.5. Acquire it: `const { onLoadError } = useI18nLoader()`. */
  onLoadError?: never;
  // Declared optional, so `if (bag.onLoadError)` compiles and is always
  // false — acquire it from `useI18nLoader()` instead.
  /** @deprecated Moved in 0.5. Acquire it: `const { onMissingKey } = useI18nPlugins()`. */
  onMissingKey?: never;
  // Declared optional, so `if (bag.onMissingKey)` compiles and is always
  // false — acquire it from `useI18nPlugins()` instead.
}

/**
 * Access i18n functionality in React components. Must be used within an `<I18nProvider>`.
 *
 * @remarks
 * Returns a NEW object every render — destructure the fields you need rather
 * than passing the whole return value to `useEffect` deps. For locale-only
 * consumers, prefer the `useLocale()` selector hook.
 *
 * @example
 * ```tsx
 * function Greeting() {
 *   const { t, locale } = useI18n();
 *   return <p>{t('greeting')} ({locale})</p>;
 * }
 * ```
 */
export function useI18n<
  D extends DefaultTranslationParams = {},
  NS extends string | undefined = undefined,
>(ns?: NS): UseI18nReturn<D, NS> {
  const { i18n, isLoading, isInitializing } = useI18nInstance();
  const locale = useContext(LocaleContext) ?? "";

  // Load-bearing: subscribes this component to re-render on the canonical
  // revision event set (return unused). The three reads below are render
  // snapshots of state that set is keyed on, so they are fresh per render.
  useStoreRevision(i18n);
  const translationCache = i18n.translationCache.getInternalMap();
  const isInitialized = i18n.isInitialized;
  const cacheRevision = i18n.translationCache.getRevision();

  // Inject the React-tracked `locale` into every bound call so descendant
  // translations resolve against the render-time locale (not the mutable
  // instance locale). Explicit `params.locale` wins via spread order.
  const tRaw = useMemo(() => {
    const bound = createBoundTranslation(i18n, ns) as (
      key: string,
      params?: TranslationParams,
    ) => TranslationResult;
    // ONE options object per render locale, reused by every no-params call:
    // `t("row.label")` down a 1 000-row list allocated 1 000 of these. Only the
    // UN-NAMESPACED form is allocation-free end to end; with a namespace bound,
    // `createBoundTranslation` still rebuilds `{ ns, ...userParams }` per call.
    //
    // Core takes the opposite trade on purpose — `createBoundTranslation.ts`
    // allocates a fresh object per call so a shared one cannot leak mutations
    // across calls. Sharing is safe HERE only because the object is frozen: a
    // user `postProcess` that writes to its `params` argument throws rather
    // than leaking, and core catches that per processor and reports it with
    // `source: "post-processor"` instead of crashing the render.
    //
    // Solid drops the options object entirely for this case
    // (`packages/solid/src/useI18n.ts`); react cannot, because the locale it
    // injects is the RENDER locale, which is not always the host's own.
    const localeOnly = Object.freeze({ locale }) as TranslationParams;
    const wrapper = (key: string, params?: TranslationParams): TranslationResult =>
      bound(key, params == null ? localeOnly : { locale, ...params });
    return wrapper as UseI18nReturn<D, NS>["tRaw"];
  }, [i18n, ns, locale]);

  const t = useMemo(
    () =>
      ((key: string, params?: TranslationParams) =>
        translationResultToString(tRaw(key as never, params as never))) as UseI18nReturn<
        D,
        NS
      >["t"],
    [tRaw],
  );

  const boundMethods = useMemo(() => {
    type BoundName = (typeof BIND_METHODS)[number];
    type Bound = { [K in BoundName]: Host[K] };
    const methods = {} as Bound;
    const bag = methods as Record<BoundName, unknown>;
    for (const m of BIND_METHODS) {
      bag[m] = (i18n[m] as (...args: unknown[]) => unknown).bind(i18n);
    }
    return {
      ...methods,
      setLocale: (loc: string) => i18n.setLocaleAsync(loc),
    };
  }, [i18n]);

  // Defaults to the render-time locale, like `t`. A raw bind would answer for
  // `i18n.locale`, which under a server-rendered provider is the host's static
  // configured locale rather than the one this tree is rendering.
  const hasTranslation = useMemo(
    () =>
      ((key: string, loc: string = locale, ns?: string, checkFallbacks?: boolean) =>
        i18n.hasTranslation(key, loc, ns, checkFallbacks)) as UseI18nReturn<
        D,
        NS
      >["hasTranslation"],
    [i18n, locale],
  );

  const formatters = useMemo(
    () => ({
      formatNumber: (value: number, options?: Intl.NumberFormatOptions, loc?: string) =>
        formatNumber(i18n, value, options, loc ?? locale),
      formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions, loc?: string) =>
        formatDate(i18n, value, options, loc ?? locale),
      formatCurrency: (
        value: number,
        currency: string,
        options?: Intl.NumberFormatOptions,
        loc?: string,
      ) => formatCurrency(i18n, value, currency, options, loc ?? locale),
      formatRelativeTime: (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        options?: Intl.RelativeTimeFormatOptions,
        loc?: string,
      ) => formatRelativeTime(i18n, value, unit, options, loc ?? locale),
    }),
    [i18n, locale],
  );

  return {
    t,
    tRaw,
    locale,
    translationCache,
    isLoading,
    isInitializing,
    isInitialized,
    cacheRevision,
    defaultParams: i18n.defaultParams as DefaultParamsSnapshot<D>,
    dir: getTextDirection(locale || i18n.locale),
    hasTranslation,
    ...(boundMethods as Omit<
      UseI18nReturn<D, NS>,
      | "t"
      | "tRaw"
      | "hasTranslation"
      | "locale"
      | "translationCache"
      | "isLoading"
      | "isInitializing"
      | "isInitialized"
      | "cacheRevision"
      | "defaultParams"
      | "dir"
      | "formatNumber"
      | "formatDate"
      | "formatCurrency"
      | "formatRelativeTime"
    >),
    ...formatters,
  };
}
