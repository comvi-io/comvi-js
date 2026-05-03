import { vi } from "vitest";
import type {
  ErrorReportContext,
  I18nEvent,
  I18nEventData,
  I18n,
  TranslationParams,
  TranslationResult,
} from "@comvi/core";
import { FakeI18nCore, type FakeI18nCoreOptions, type FakeTranslationCache } from "./fakeI18nCore";

type FakeI18nOptions = Pick<FakeI18nCoreOptions, "language" | "defaultNamespace">;

export class FakeI18n {
  private readonly core: FakeI18nCore;

  constructor(options: FakeI18nOptions = {}) {
    this.core = new FakeI18nCore({
      language: options.language,
      defaultNamespace: options.defaultNamespace,
    });
  }

  get initError(): unknown {
    return this.core.initError;
  }

  set initError(value: unknown) {
    this.core.initError = value;
  }

  get namespaceLoadResult(): Promise<void> {
    return this.core.namespaceLoadResult;
  }

  set namespaceLoadResult(value: Promise<void>) {
    this.core.namespaceLoadResult = value;
  }

  get lastFallbackLanguage(): string | string[] | null {
    return this.core.lastFallbackLanguage;
  }

  get tImplementation(): (key: string, params?: TranslationParams) => TranslationResult {
    return this.core.tImplementation;
  }

  set tImplementation(value: (key: string, params?: TranslationParams) => TranslationResult) {
    this.core.setTImplementation(value);
  }

  public readonly init = vi.fn(async (): Promise<I18n> => {
    await this.core.init();
    return this.asI18n();
  });

  public readonly setLanguageAsync = vi.fn(async (language: string): Promise<void> => {
    await this.core.setLanguageAsync(language);
  });

  public readonly setLocaleAsync = vi.fn(async (locale: string): Promise<void> => {
    await this.core.setLocaleAsync(locale);
  });

  public readonly addTranslations = vi.fn(
    (translations: Record<string, Record<string, unknown>>): void => {
      this.core.addTranslations(translations);
    },
  );

  public readonly addActiveNamespace = vi.fn(async (namespace: string): Promise<void> => {
    await this.core.addActiveNamespace(namespace);
  });

  public readonly reloadTranslations = vi.fn(
    async (language?: string, namespace?: string): Promise<void> => {
      await this.core.reloadTranslations(language, namespace);
    },
  );

  public readonly clearTranslations = vi.fn((language?: string, namespace?: string): void => {
    this.core.clearTranslations(language, namespace);
  });

  public readonly setFallbackLanguage = vi.fn((fallback: string | string[]): void => {
    this.core.setFallbackLanguage(fallback);
  });

  public readonly setFallbackLocale = vi.fn((fallback: string | string[]): void => {
    this.core.setFallbackLanguage(fallback);
  });

  public readonly onMissingKey = vi.fn(
    (
      callback: (key: string, language: string, namespace: string) => TranslationResult | void,
    ): (() => void) => {
      return this.core.onMissingKey(callback);
    },
  );

  public readonly onLoadError = vi.fn(
    (callback: (language: string, namespace: string, error: Error) => void): (() => void) => {
      return this.core.onLoadError(callback);
    },
  );

  public readonly reportError = vi.fn((error: unknown, context?: ErrorReportContext): void => {
    this.core.reportError(error, context);
  });

  public readonly hasLanguage = vi.fn((language: string, namespace?: string): boolean => {
    return this.core.hasLanguage(language, namespace);
  });

  public readonly hasLocale = vi.fn((locale: string, namespace?: string): boolean => {
    return this.core.hasLanguage(locale, namespace);
  });

  public readonly getLoadedLanguages = vi.fn((): string[] => {
    return this.core.getLoadedLanguages();
  });

  public readonly getLoadedLocales = vi.fn((): string[] => {
    return this.core.getLoadedLanguages();
  });

  public readonly getActiveNamespaces = vi.fn((): string[] => {
    return this.core.getActiveNamespaces();
  });

  public readonly getDefaultNamespace = vi.fn((): string => {
    return this.core.getDefaultNamespace();
  });

  public readonly getTranslations = vi.fn((): Record<string, Record<string, unknown>> => {
    return this.core.getTranslations();
  });

  public readonly t = vi.fn((key: string, params?: TranslationParams): TranslationResult => {
    return this.core.t(key, params);
  });

  public readonly tRaw = vi.fn((key: string, params?: TranslationParams): TranslationResult => {
    return this.core.t(key, params);
  });

  public readonly hasTranslation = vi.fn(
    (key: string, language?: string, namespace?: string, checkFallbacks?: boolean): boolean => {
      return this.core.hasTranslation(key, language, namespace, checkFallbacks);
    },
  );

  get language(): string {
    return this.core.language;
  }

  set language(value: string) {
    this.core.language = value;
  }

  get locale(): string {
    return this.core.language;
  }

  set locale(value: string) {
    this.core.language = value;
  }

  get apiKey(): string | undefined {
    return undefined;
  }

  get devMode(): boolean {
    return true;
  }

  get translationCache(): FakeTranslationCache {
    return this.core.translationCache;
  }

  get isLoading(): boolean {
    return this.core.isLoading;
  }

  set isLoading(value: boolean) {
    this.core.isLoading = value;
  }

  get isInitializing(): boolean {
    return this.core.isInitializing;
  }

  set isInitializing(value: boolean) {
    this.core.isInitializing = value;
  }

  get isInitialized(): boolean {
    return this.core.isInitialized;
  }

  set isInitialized(value: boolean) {
    this.core.isInitialized = value;
  }

  public on<E extends I18nEvent>(
    event: E,
    callback: (payload: I18nEventData[E]) => void,
  ): () => void {
    return this.core.on(event, callback);
  }

  public emit<E extends I18nEvent>(event: E, payload: I18nEventData[E]): void {
    this.core.emit(event, payload);
  }

  public listenerCount(event: I18nEvent): number {
    return this.core.listenerCount(event);
  }

  public readonly formatNumber = vi.fn(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(this.core.language, options).format(value);
    },
  );

  public readonly formatDate = vi.fn(
    (value: Date | number, options?: Intl.DateTimeFormatOptions): string => {
      return new Intl.DateTimeFormat(this.core.language, options).format(value);
    },
  );

  public readonly formatCurrency = vi.fn(
    (value: number, currency: string, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(this.core.language, {
        ...options,
        style: "currency",
        currency,
      }).format(value);
    },
  );

  public readonly formatRelativeTime = vi.fn(
    (
      value: number,
      unit: Intl.RelativeTimeFormatUnit,
      options?: Intl.RelativeTimeFormatOptions,
    ): string => {
      return new Intl.RelativeTimeFormat(this.core.language, options).format(value, unit);
    },
  );

  public get dir(): "ltr" | "rtl" {
    // Tests run on modern Node, use Intl.Locale.textInfo directly
    try {
      const info = (
        new Intl.Locale(this.core.language) as Intl.Locale & {
          textInfo?: { direction?: string };
        }
      ).textInfo;
      if (info?.direction === "rtl") return "rtl";
    } catch {
      // fall through
    }
    return "ltr";
  }

  public asI18n(): I18n {
    return this as unknown as I18n;
  }
}
