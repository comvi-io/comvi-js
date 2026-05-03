import {
  computed,
  readonly,
  ref,
  shallowRef,
  triggerRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import { vi } from "vitest";
import type {
  ErrorReportContext,
  I18nEvent,
  I18nEventData,
  TranslationParams,
  TranslationResult,
} from "@comvi/core";
import { FakeI18nCore } from "./fakeI18nCore";

type TranslationMap = Map<string, Record<string, unknown>>;
type Unsubscribe = () => void;

export interface FakeVueI18nOptions {
  language?: string;
  defaultNs?: string;
  tImplementation?: (key: string, params?: TranslationParams) => TranslationResult;
}

export interface FakeVueI18n {
  language: Ref<string>;
  isLoading: Readonly<Ref<boolean>>;
  isInitializing: Readonly<Ref<boolean>>;
  translationCache: Readonly<Ref<Readonly<TranslationMap>>>;
  t: (key: string, params?: TranslationParams) => TranslationResult;
  setLanguage: (language: string) => Promise<void>;
  addTranslations: (translations: Record<string, Record<string, unknown>>) => void;
  addActiveNamespace: (namespace: string) => Promise<void>;
  setFallbackLanguage: (languages: string | string[]) => void;
  onMissingKey: (
    callback: (key: string, language: string, namespace: string) => void,
  ) => () => void;
  onLoadError: (
    callback: (language: string, namespace: string, error: Error) => void,
  ) => () => void;
  clearTranslations: (language?: string, namespace?: string) => void;
  reloadTranslations: (language?: string, namespace?: string) => Promise<void>;
  hasLanguage: (language: string, namespace?: string) => boolean;
  hasTranslation: (
    key: string,
    language?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;
  getLoadedLanguages: () => string[];
  getActiveNamespaces: () => string[];
  getDefaultNamespace: () => string;
  on: <E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void) => () => void;
  reportError: (error: unknown, context?: ErrorReportContext) => void;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;
  dir: ComputedRef<"ltr" | "rtl">;
  destroy: () => void;
  __emit: <E extends I18nEvent>(event: E, payload: I18nEventData[E]) => void;
  __setTImplementation: (
    fn: (key: string, params?: TranslationParams) => TranslationResult,
  ) => void;
  __setNamespaceLoadResult: (promise: Promise<void>) => void;
}

export function createFakeVueI18n(options: FakeVueI18nOptions = {}): FakeVueI18n {
  const core = new FakeI18nCore({
    language: options.language,
    defaultNamespace: options.defaultNs,
    tImplementation: options.tImplementation,
  });
  const language = ref(core.language);
  const isLoading = ref(core.isLoading);
  const isInitializing = ref(core.isInitializing);
  const translationCacheRef: ShallowRef<Readonly<TranslationMap>> = shallowRef(
    core.translationCache.getInternalMap(),
  );
  const internalUnsubscribers: Unsubscribe[] = [];

  internalUnsubscribers.push(
    core.on("languageChanged", ({ to }) => {
      language.value = to;
    }),
    core.on(
      "loadingStateChanged",
      ({ isLoading: nextIsLoading, isInitializing: nextIsInitializing }) => {
        isLoading.value = nextIsLoading;
        isInitializing.value = nextIsInitializing;
      },
    ),
    core.on("namespaceLoaded", () => {
      triggerRef(translationCacheRef);
    }),
    core.on("translationsCleared", () => {
      triggerRef(translationCacheRef);
    }),
    core.on("initialized", () => {
      isInitializing.value = core.isInitializing;
    }),
  );

  const api: FakeVueI18n = {
    language,
    isLoading: readonly(isLoading),
    isInitializing: readonly(isInitializing),
    translationCache: readonly(translationCacheRef),
    t: vi.fn((key: string, params?: TranslationParams) => core.t(key, params)),
    setLanguage: vi.fn(async (nextLanguage: string): Promise<void> => {
      await core.setLanguageAsync(nextLanguage);
    }),
    addTranslations: vi.fn((translations: Record<string, Record<string, unknown>>): void => {
      core.addTranslations(translations);
    }),
    addActiveNamespace: vi.fn(async (namespace: string): Promise<void> => {
      await core.addActiveNamespace(namespace);
    }),
    setFallbackLanguage: vi.fn((languages: string | string[]): void => {
      core.setFallbackLanguage(languages);
    }),
    onMissingKey: vi.fn(
      (callback: (key: string, language: string, namespace: string) => void): (() => void) => {
        return core.onMissingKey(callback);
      },
    ),
    onLoadError: vi.fn(
      (callback: (language: string, namespace: string, error: Error) => void): (() => void) => {
        return core.onLoadError(callback);
      },
    ),
    clearTranslations: vi.fn((targetLanguage?: string, targetNamespace?: string): void => {
      core.clearTranslations(targetLanguage, targetNamespace);
    }),
    reloadTranslations: vi.fn(
      async (targetLanguage?: string, targetNamespace?: string): Promise<void> => {
        await core.reloadTranslations(targetLanguage, targetNamespace);
      },
    ),
    hasLanguage: vi.fn((targetLanguage: string, targetNamespace?: string): boolean => {
      return core.hasLanguage(targetLanguage, targetNamespace);
    }),
    hasTranslation: vi.fn(
      (
        key: string,
        targetLanguage?: string,
        targetNamespace?: string,
        checkFallbacks?: boolean,
      ): boolean => {
        return core.hasTranslation(key, targetLanguage, targetNamespace, checkFallbacks);
      },
    ),
    getLoadedLanguages: vi.fn((): string[] => {
      return core.getLoadedLanguages();
    }),
    getActiveNamespaces: vi.fn((): string[] => {
      return core.getActiveNamespaces();
    }),
    getDefaultNamespace: vi.fn((): string => {
      return core.getDefaultNamespace();
    }),
    on: vi.fn(
      <E extends I18nEvent>(
        event: E,
        callback: (payload: I18nEventData[E]) => void,
      ): (() => void) => {
        return core.on(event, callback);
      },
    ),
    reportError: vi.fn((error: unknown, context?: ErrorReportContext): void => {
      core.reportError(error, context);
    }),
    formatNumber: vi.fn((value: number, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(language.value, options).format(value);
    }),
    formatDate: vi.fn((value: Date | number, options?: Intl.DateTimeFormatOptions): string => {
      return new Intl.DateTimeFormat(language.value, options).format(value);
    }),
    formatCurrency: vi.fn(
      (value: number, currency: string, options?: Intl.NumberFormatOptions): string => {
        return new Intl.NumberFormat(language.value, {
          ...options,
          style: "currency",
          currency,
        }).format(value);
      },
    ),
    formatRelativeTime: vi.fn(
      (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        options?: Intl.RelativeTimeFormatOptions,
      ): string => {
        return new Intl.RelativeTimeFormat(language.value, options).format(value, unit);
      },
    ),
    dir: computed<"ltr" | "rtl">(() => {
      // Tests run on modern Node, use Intl.Locale.textInfo directly
      try {
        const info = (
          new Intl.Locale(language.value) as Intl.Locale & {
            textInfo?: { direction?: string };
          }
        ).textInfo;
        if (info?.direction === "rtl") return "rtl";
      } catch {
        // fall through
      }
      return "ltr";
    }),
    destroy: vi.fn(() => {
      while (internalUnsubscribers.length > 0) {
        internalUnsubscribers.pop()?.();
      }
    }),
    __emit: <E extends I18nEvent>(event: E, payload: I18nEventData[E]): void => {
      core.emit(event, payload);
    },
    __setTImplementation(fn: (key: string, params?: TranslationParams) => TranslationResult) {
      core.setTImplementation(fn);
    },
    __setNamespaceLoadResult(promise: Promise<void>) {
      core.namespaceLoadResult = promise;
    },
  };

  return api;
}
