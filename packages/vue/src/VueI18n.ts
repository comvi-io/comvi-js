import {
  I18n,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";
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
  type Ref,
  type ShallowRef,
  type ComputedRef,
  type WritableComputedRef,
  type App,
} from "vue";
import { I18N_INJECTION_KEY } from "./keys";
import { translationResultToString } from "./utils";

/**
 * Vue-specific i18n options extending core options
 */
export interface VueI18nOptions extends I18nOptions {
  /**
   * Initial locale for SSR hydration.
   * Use this to prevent hydration mismatches when server renders with a different
   * locale than what the client would detect.
   */
  ssrLocale?: string;
}

/**
 * Vue-specific wrapper around the core I18n using composition
 * Provides Vue reactivity integration and plugin installation
 */
export class VueI18n {
  private _core: I18n;

  private _locale: ShallowRef<string>;
  private _localeComputed?: WritableComputedRef<string>;
  private _isLoading: ShallowRef<boolean>;
  private _isInitializing: ShallowRef<boolean>;
  private _cacheRevision: ShallowRef<number>;
  private _configRevision: ShallowRef<number>;
  private _translationCacheComputed?: ComputedRef<ReadonlyMap<string, FlattenedTranslations>>;
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
  declare setFallbackLocale: (locales: string | string[]) => void;
  declare reportError: (error: unknown, context?: Parameters<I18n["reportError"]>[1]) => void;
  declare formatNumber: (
    value: number,
    options?: Intl.NumberFormatOptions,
    locale?: string,
  ) => string;
  declare formatDate: (
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
    locale?: string,
  ) => string;
  declare formatCurrency: (
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
    locale?: string,
  ) => string;
  declare formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
    locale?: string,
  ) => string;
  constructor(options: VueI18nOptions) {
    const initialLocale = options.ssrLocale ?? options.locale;

    this._core = new I18n({
      ...options,
      locale: initialLocale,
    });

    this._locale = shallowRef(initialLocale);
    this._requestedLocale = initialLocale;
    this._isLoading = shallowRef(this._core.isLoading);
    this._isInitializing = shallowRef(this._core.isInitializing);
    this._cacheRevision = shallowRef(this._core.translationCache.getRevision());
    this._configRevision = shallowRef(0);
    const syncCache = () => {
      this._cacheRevision.value = this._core.translationCache.getRevision();
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
      this._core.on("defaultNamespaceChanged", () => {
        syncCache();
        this._configRevision.value++;
      }),
      this._core.on("configChanged", () => {
        // Bump a separate revision so computed refs that depend on config
        // (fallbackLocale, namespace activation without a loader, etc.) re-evaluate
        // without interfering with _cacheRevision's sync to the real cache.
        this._configRevision.value++;
      }),
    );

    // Explicit proxy bindings for spyability
    const core = this._core;
    this.addTranslations = core.addTranslations.bind(core);
    this.addActiveNamespace = core.addActiveNamespace.bind(core);
    this.clearTranslations = core.clearTranslations.bind(core);
    this.reloadTranslations = core.reloadTranslations.bind(core);
    this.registerLoader = core.registerLoader.bind(core);
    this.registerPostProcessor = core.registerPostProcessor.bind(core);
    this.onMissingKey = core.onMissingKey.bind(core);
    this.onLoadError = core.onLoadError.bind(core);
    this.on = core.on.bind(core);
    this.setFallbackLocale = core.setFallbackLocale.bind(core);
    this.reportError = core.reportError.bind(core);
    // Default to the reactive locale ref so template usages re-render on locale change
    this.formatNumber = (value, options, locale) =>
      formatNumber(core, value, options, locale ?? this._locale.value);
    this.formatDate = (value, options, locale) =>
      formatDate(core, value, options, locale ?? this._locale.value);
    this.formatCurrency = (value, currency, options, locale) =>
      formatCurrency(core, value, currency, options, locale ?? this._locale.value);
    this.formatRelativeTime = (value, unit, options, locale) =>
      formatRelativeTime(core, value, unit, options, locale ?? this._locale.value);
    this.registerLocaleDetector = core.registerLocaleDetector.bind(core);

    // Bind own methods for destructuring support
    this.t = this.t.bind(this);
    this.tRaw = this.tRaw.bind(this);
    this.setLocale = this.setLocale.bind(this);
    this.destroy = this.destroy.bind(this);
    this.hasTranslation = this.hasTranslation.bind(this);
    this.hasLocale = this.hasLocale.bind(this);
    this.hasTranslationNow = this.hasTranslationNow.bind(this);
    this.hasLocaleNow = this.hasLocaleNow.bind(this);
  }

  get locale(): Ref<string> {
    if (!this._localeComputed) {
      this._localeComputed = computed({
        get: () => this._locale.value,
        set: (newLocale: string) => {
          if (this._requestedLocale !== newLocale) {
            this.setLocale(newLocale).catch((error) => {
              this._core.reportError(error, { source: "setLocale" });
            });
          }
        },
      });
    }
    return this._localeComputed;
  }

  set locale(value: string) {
    this.setLocale(value).catch((error) => {
      this._core.reportError(error, { source: "setLocale" });
    });
  }

  private _dirComputed?: ComputedRef<"ltr" | "rtl">;
  /** Text direction for the current locale, as a reactive computed ref */
  get dir(): ComputedRef<"ltr" | "rtl"> {
    if (!this._dirComputed) {
      this._dirComputed = computed(() => getTextDirection(this._locale.value));
    }
    return this._dirComputed;
  }

  private _loadedLocalesComputed?: ComputedRef<string[]>;
  get loadedLocales(): ComputedRef<string[]> {
    if (!this._loadedLocalesComputed) {
      this._loadedLocalesComputed = computed(() => {
        void this._cacheRevision.value;
        return this._core.getLoadedLocales();
      });
    }
    return this._loadedLocalesComputed;
  }

  private _activeNamespacesComputed?: ComputedRef<string[]>;
  get activeNamespaces(): ComputedRef<string[]> {
    if (!this._activeNamespacesComputed) {
      this._activeNamespacesComputed = computed(() => {
        void this._cacheRevision.value;
        void this._configRevision.value;
        return this._core.getActiveNamespaces();
      });
    }
    return this._activeNamespacesComputed;
  }

  private _defaultNamespaceComputed?: ComputedRef<string>;
  /** Current default namespace as a reactive ComputedRef */
  get defaultNamespace(): ComputedRef<string> {
    if (!this._defaultNamespaceComputed) {
      this._defaultNamespaceComputed = computed(() => {
        void this._cacheRevision.value;
        void this._configRevision.value;
        return this._core.getDefaultNamespace();
      });
    }
    return this._defaultNamespaceComputed;
  }

  /**
   * Reactive check for translation existence. Returns a ComputedRef that
   * re-evaluates when locale, cache, or config changes. Call inside component setup
   * (or an effectScope) — the underlying `computed()` registers with the
   * active scope and disposes automatically.
   */
  hasTranslation(
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ): ComputedRef<boolean> {
    return computed(() => {
      void this._locale.value;
      void this._cacheRevision.value;
      void this._configRevision.value;
      return this._core.hasTranslation(key, opts?.locale, opts?.namespace, opts?.checkFallbacks);
    });
  }

  /**
   * Reactive check for locale availability. Returns a ComputedRef that
   * re-evaluates when the translation cache changes.
   */
  hasLocale(locale: string, namespace?: string): ComputedRef<boolean> {
    return computed(() => {
      void this._cacheRevision.value;
      return this._core.hasLocale(locale, namespace);
    });
  }

  /** Imperative (non-reactive) translation-existence check — plain boolean, for use outside a reactive scope. */
  hasTranslationNow(
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ): boolean {
    return this._core.hasTranslation(key, opts?.locale, opts?.namespace, opts?.checkFallbacks);
  }

  /** Imperative (non-reactive) locale-availability check — plain boolean, for use outside a reactive scope. */
  hasLocaleNow(locale: string, namespace?: string): boolean {
    return this._core.hasLocale(locale, namespace);
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

  get translationCache(): ComputedRef<ReadonlyMap<string, FlattenedTranslations>> {
    if (!this._translationCacheComputed) {
      this._translationCacheComputed = computed(() => {
        void this._cacheRevision.value;
        return this._core.translationCache.getInternalMap();
      });
    }
    return this._translationCacheComputed;
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
    void this._configRevision.value;
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

    this._unsubscribers
      .slice()
      .reverse()
      .forEach((unsub) => unsub());
    this._unsubscribers.length = 0;

    this._core.destroy().catch((error) => {
      this._core.reportError(error, { source: "plugin-cleanup" });
    });
  }

  private _installedApps = new WeakSet<App>();

  /**
   * Install the i18n plugin into a Vue app.
   *
   * Side effects:
   * - Provides the i18n instance via `I18N_INJECTION_KEY` so `useI18n()` works.
   * - Registers `$t`, `$tRaw`, `$i18n` global properties for Options API + templates.
   * - If the core isn't initialized yet, kicks off `init()` asynchronously (fire-and-forget).
   *
   * SSR note: on server-side rendering, call `await i18n.init()` BEFORE
   * `renderToString(app)`. The fire-and-forget `init()` here is for client-side
   * convenience only — on the server, rendering races against translation loading
   * and you may serialize stale/empty caches.
   */
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
