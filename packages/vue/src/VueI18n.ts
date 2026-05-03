import { I18n } from "@comvi/core";
import type {
  I18nOptions,
  FlattenedTranslations,
  TranslationParams,
  TranslationResult,
  TranslationValue,
  I18nPlugin,
  I18nEvent,
  I18nEventData,
} from "@comvi/core";
import {
  shallowRef,
  readonly,
  computed,
  triggerRef,
  type Ref,
  type ShallowRef,
  type App,
} from "vue";
import { I18N_INJECTION_KEY } from "./keys";
import { translationResultToString } from "./utils";

/**
 * Vue-specific i18n options extending core options
 */
export interface VueI18nOptions extends I18nOptions {
  /** @deprecated Use locale. */
  language?: string;

  /**
   * Initial locale for SSR hydration.
   * Use this to prevent hydration mismatches when server renders with a different
   * locale than what the client would detect.
   */
  ssrLanguage?: string;
}

/** Methods delegated directly to the core (generated in constructor) */
const PROXY_METHODS = [
  "addTranslations",
  "addActiveNamespace",
  "clearTranslations",
  "reloadTranslations",
  "registerLoader",
  "registerPostProcessor",
  "onMissingKey",
  "onLoadError",
  "on",
  "hasLocale",
  "hasTranslation",
  "setFallbackLocale",
  "getDefaultNamespace",
  "reportError",
  "getActiveNamespaces",
  "formatNumber",
  "formatDate",
  "formatCurrency",
  "formatRelativeTime",
] as const;

/**
 * Vue-specific wrapper around the core I18n using composition
 * Provides Vue reactivity integration and plugin installation
 */
export class VueI18n {
  private _core: I18n;

  private _locale: ShallowRef<string>;
  private _localeComputed?: import("vue").WritableComputedRef<string>;
  private _isLoading: ShallowRef<boolean>;
  private _isInitializing: ShallowRef<boolean>;
  private _cacheRevision: ShallowRef<number>;
  private _translationCacheRef!: ShallowRef<Readonly<ReadonlyMap<string, FlattenedTranslations>>>;
  private _unsubscribers: Array<() => void> = [];
  private _requestedLocale: string;
  private _localeQueue: Promise<void> = Promise.resolve();
  private _isLocaleQueueIdle = true;
  private _isDestroyed = false;

  // Type declarations for dynamically generated proxy methods
  declare addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;
  declare addActiveNamespace: (namespace: string) => Promise<void>;
  declare clearTranslations: (language?: string, namespace?: string) => void;
  declare reloadTranslations: (language?: string, namespace?: string) => Promise<void>;
  declare registerLoader: (loader: Parameters<I18n["registerLoader"]>[0]) => void;
  declare registerLocaleDetector: (detector: () => string | Promise<string>) => void;
  declare registerPostProcessor: (
    processor: (
      result: TranslationResult,
      key: string,
      namespace: string,
      params?: TranslationParams,
    ) => TranslationResult,
  ) => void;
  declare onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ) => () => void;
  declare onLoadError: (
    callback: (locale: string, namespace: string, error: Error) => void,
  ) => () => void;
  declare on: <E extends I18nEvent>(
    event: E,
    callback: (payload: I18nEventData[E]) => void,
  ) => () => void;
  declare hasLocale: (locale: string, namespace?: string) => boolean;
  declare hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;
  declare getLoadedLocales: () => string[];
  declare setFallbackLocale: (locales: string | string[]) => void;
  declare getDefaultNamespace: () => string;
  declare reportError: (error: unknown, context?: Parameters<I18n["reportError"]>[1]) => void;
  declare getActiveNamespaces: () => string[];
  declare formatNumber: I18n["formatNumber"];
  declare formatDate: I18n["formatDate"];
  declare formatCurrency: I18n["formatCurrency"];
  declare formatRelativeTime: I18n["formatRelativeTime"];

  constructor(options: VueI18nOptions) {
    const initialLocale = options.ssrLanguage ?? options.locale ?? options.language;

    this._core = new I18n({
      ...options,
      locale: initialLocale,
    });

    this._locale = shallowRef(initialLocale);
    this._requestedLocale = initialLocale;
    this._isLoading = shallowRef(this._core.isLoading);
    this._isInitializing = shallowRef(this._core.isInitializing);
    this._cacheRevision = shallowRef(this._core.translationCache.getRevision());
    this._translationCacheRef = shallowRef(this._core.translationCache.getInternalMap());
    const syncCache = () => {
      this._cacheRevision.value = this._core.translationCache.getRevision();
      this._translationCacheRef.value = this._core.translationCache.getInternalMap();
      triggerRef(this._translationCacheRef);
    };

    this._unsubscribers.push(
      this._core.on("localeChanged", ({ to }) => {
        this._locale.value = to;
        this._requestedLocale = to;
      }),
      this._core.on("namespaceLoaded", syncCache),
      this._core.on("loadingStateChanged", ({ isLoading, isInitializing }) => {
        this._isLoading.value = isLoading;
        this._isInitializing.value = isInitializing;
      }),
      this._core.on("initialized", () => {
        this._locale.value = this._core.locale;
        syncCache();
        this._isLoading.value = this._core.isLoading;
        this._isInitializing.value = this._core.isInitializing;
      }),
      this._core.on("translationsCleared", syncCache),
    );

    // Generate proxy methods: late-bind through _core for spyability
    const core = this._core;
    for (const m of PROXY_METHODS) {
      (this as any)[m] = (...a: any[]) => (core[m] as any)(...a);
    }

    // Renamed core methods: pass-through proxies (kept explicit for spyability + clarity)
    (this as any).registerLocaleDetector = (detector: () => string | Promise<string>) =>
      core.registerLocaleDetector(detector);
    (this as any).getLoadedLocales = () => core.getLoadedLocales();

    // Bind remaining own methods for destructuring support
    this.t = this.t.bind(this);
    this.tRaw = this.tRaw.bind(this);
    this.setLocale = this.setLocale.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  get locale(): Ref<string> {
    if (!this._localeComputed) {
      this._localeComputed = computed({
        get: () => this._locale.value,
        set: (newLocale: string) => {
          if (this._requestedLocale !== newLocale) {
            this.setLocale(newLocale).catch((e) => {
              console.error("[i18n] Failed to set locale:", e);
            });
          }
        },
      });
    }
    return this._localeComputed;
  }

  set locale(value: string) {
    this.setLocale(value).catch((e) => {
      console.error("[i18n] Failed to set locale:", e);
    });
  }

  private _dirComputed?: import("vue").ComputedRef<"ltr" | "rtl">;
  /** Text direction for the current locale, as a reactive computed ref */
  get dir(): import("vue").ComputedRef<"ltr" | "rtl"> {
    if (!this._dirComputed) {
      // Read locale ref to establish reactive dependency, then delegate to core
      this._dirComputed = computed(() => {
        void this._locale.value;
        return this._core.dir;
      });
    }
    return this._dirComputed;
  }

  async setLocale(locale: string): Promise<void> {
    const target = locale;
    this._requestedLocale = target;
    const run = async () => {
      if (this._core.locale !== target) {
        await this._core.setLocaleAsync(target);
      }
    };

    const task = this._isLocaleQueueIdle ? run() : this._localeQueue.then(run, run);
    this._isLocaleQueueIdle = false;

    const tail = task.catch(() => {});
    this._localeQueue = tail;
    tail.finally(() => {
      if (this._localeQueue === tail) {
        this._isLocaleQueueIdle = true;
      }
    });

    try {
      await task;
    } catch (error) {
      if (this._requestedLocale === target) {
        this._requestedLocale = this._core.locale;
      }
      throw error;
    }
  }

  get translationCache(): Readonly<Ref<Readonly<ReadonlyMap<string, FlattenedTranslations>>>> {
    return this._translationCacheRef;
  }

  get isLoading(): Readonly<Ref<boolean>> {
    return readonly(this._isLoading);
  }

  get isInitializing(): Readonly<Ref<boolean>> {
    return readonly(this._isInitializing);
  }

  /** Raw translation result for rich text renderers and advanced integrations. */
  tRaw<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(key: K, ...params: import("@comvi/core").NamespacedParamsArg<NS, K>): TranslationResult;

  /** Raw translation result for typed keys. */
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): TranslationResult;

  /** Raw translation result for permissive keys. */
  tRaw(
    key: import("@comvi/core").PermissiveKey,
    params?: import("@comvi/core").TranslationParams,
  ): TranslationResult;

  tRaw(key: string, ...params: [import("@comvi/core").TranslationParams?]): TranslationResult {
    void this._locale.value;
    void this._cacheRevision.value;
    return this._core.tRaw(key as any, ...(params as any));
  }

  /**
   * Translate a namespaced key (when ns is provided). Always returns plain text.
   */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(key: K, ...params: import("@comvi/core").NamespacedParamsArg<NS, K>): string;

  /**
   * Translate a key with Vue reactivity tracking - typed keys. Always returns plain text.
   */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;

  /**
   * Permissive overload - only active when TranslationKeys is empty. Always returns plain text.
   */
  t(
    key: import("@comvi/core").PermissiveKey,
    params?: import("@comvi/core").TranslationParams,
  ): string;

  t(key: string, ...params: [import("@comvi/core").TranslationParams?]): string {
    return translationResultToString(this.tRaw(key as any, ...(params as any)));
  }

  async init(): Promise<this> {
    await this._core.init();
    return this;
  }

  use(plugin: I18nPlugin, options?: Parameters<I18n["use"]>[1]): this {
    this._core.use(plugin, options);
    return this;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    this._unsubscribers.reverse().forEach((unsub) => unsub());
    this._unsubscribers.length = 0;

    this._core.destroy().catch((error) => {
      this._core.reportError(error, { source: "plugin-cleanup" });
    });
  }

  private _installedApps = new WeakSet<App>();

  install(app: App): void {
    if (this._installedApps.has(app)) return;
    this._installedApps.add(app);

    if (!this._core.isInitialized && !this._core.isInitializing) {
      this.init().catch((error) => {
        this._core.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "init",
        });
      });
    }

    app.provide(I18N_INJECTION_KEY, this);
    app.config.globalProperties.$i18n = this;
    app.config.globalProperties.$t = this.t;
    app.config.globalProperties.$tRaw = this.tRaw;
  }
}

export function createI18n(options: VueI18nOptions): VueI18n {
  return new VueI18n(options);
}

declare module "vue" {
  export interface ComponentCustomProperties {
    $t: VueI18n["t"];
    $tRaw: VueI18n["tRaw"];
    $i18n: VueI18n;
  }
}
