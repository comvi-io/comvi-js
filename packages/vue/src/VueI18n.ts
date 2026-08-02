import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
  hasPluginHostApi,
  missingCapability,
  subscribeToRevision,
  translationResultToString,
} from "@comvi/core/slim";
import type {
  I18n,
  I18nOptions,
  FlattenedTranslations,
  TranslationParams,
  TranslationResult,
  TranslationValue,
  I18nPlugin,
  I18nPluginHostApi,
  I18nEvent,
  I18nEventData,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
  WrapperI18nHost,
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

/**
 * Vue-layer options — the ones that do NOT configure the core.
 *
 * `createI18nFromCore` takes exactly these: the host it is handed is already
 * built, so every core option belongs to whoever built it.
 */
export interface VueI18nCoreOptions {
  /**
   * Initial locale for SSR hydration.
   * Use this to prevent hydration mismatches when server renders with a different
   * locale than what the client would detect.
   */
  ssrLocale?: string;
}

/**
 * Vue-specific i18n options extending core options
 */
export type VueI18nOptions<D extends DefaultTranslationParams = {}> = I18nOptions<D> &
  VueI18nCoreOptions;

/**
 * Vue-specific wrapper around a core i18n host, using composition.
 * Provides Vue reactivity integration and plugin installation.
 *
 * The host is injected (`createI18nFromCore`) or built by `createI18n`, and
 * stays reachable as {@link VueI18n.core}: everything the wrapper does not
 * proxy — including the loader and plugin-host capabilities, when the host
 * has them — is done through it. `C` is exact when you hold the factory
 * result; through `inject(I18N_INJECTION_KEY)` the core is seen as a bare
 * {@link WrapperI18nHost}, so capability calls are a compile error there
 * (framework-slim §3.2).
 */
export class VueI18n<
  D extends DefaultTranslationParams = {},
  C extends WrapperI18nHost<D> = I18n<D>,
> {
  /** The core host this wrapper drives. */
  readonly core: C;

  private _locale: ShallowRef<string>;
  private _localeComputed?: WritableComputedRef<string>;
  private _isLoading: ShallowRef<boolean>;
  private _isInitializing: ShallowRef<boolean>;
  private _cacheRevision: ShallowRef<number>;
  private _configRevision: ShallowRef<number>;
  private _defaultParamsComputed?: ComputedRef<DefaultParamsSnapshot<D>>;
  private _translationCacheComputed?: ComputedRef<ReadonlyMap<string, FlattenedTranslations>>;
  private _unsubscribers: Array<() => void> = [];
  private _requestedLocale: string;
  private _localeQueue: Promise<void> = Promise.resolve();
  private _isLocaleQueueIdle = true;
  private _isDestroyed = false;

  // Type declarations for dynamically generated proxy methods
  declare addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;
  declare clearTranslations: (language?: string, namespace?: string) => void;
  declare on: <E extends I18nEvent>(
    event: E,
    callback: (payload: I18nEventData[E]) => void,
  ) => () => void;
  declare setFallbackLocale: (locales: string | string[]) => void;
  declare setDefaultParams: WrapperI18nHost<D>["setDefaultParams"];
  declare reportError: (
    error: unknown,
    context?: Parameters<WrapperI18nHost["reportError"]>[1],
  ) => void;
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
  /**
   * @param core - The host this wrapper drives. Built for you by
   *   {@link createI18n}; injected as-is by `createI18nFromCore`.
   * @param options - Vue-layer options only (see {@link VueI18nCoreOptions}).
   */
  constructor(core: C, options: VueI18nCoreOptions = {}) {
    this.core = core;

    // `ssrLocale` is the render locale: the host follows it, so the reactive
    // ref and `core.locale` can never disagree at construction time. On the
    // `createI18n` path the core was already built with it, so this is a no-op.
    const initialLocale = options.ssrLocale ?? core.locale;
    if (core.locale !== initialLocale) {
      core.locale = initialLocale;
    }

    this._locale = shallowRef(initialLocale);
    this._requestedLocale = initialLocale;
    this._isLoading = shallowRef(this.core.isLoading);
    this._isInitializing = shallowRef(this.core.isInitializing);
    this._cacheRevision = shallowRef(this.core.translationCache.getRevision());
    this._configRevision = shallowRef(0);
    const syncCache = () => {
      this._cacheRevision.value = this.core.translationCache.getRevision();
    };

    // Canonical revision event set from core (subscribeToRevision); the switch
    // preserves the previous per-event bridge semantics exactly.
    this._unsubscribers.push(
      subscribeToRevision(this.core, (event) => {
        switch (event) {
          case "localeChanged":
            // core.locale === payload.to: the core sets _locale before emitting.
            this._locale.value = this.core.locale;
            this._requestedLocale = this.core.locale;
            break;
          case "loadingStateChanged":
            this._isLoading.value = this.core.isLoading;
            this._isInitializing.value = this.core.isInitializing;
            break;
          case "initialized":
            this._locale.value = this.core.locale;
            syncCache();
            this._isLoading.value = this.core.isLoading;
            this._isInitializing.value = this.core.isInitializing;
            break;
          case "namespaceLoaded":
          case "translationsCleared":
            syncCache();
            break;
          case "defaultNamespaceChanged":
            syncCache();
            this._configRevision.value++;
            break;
          case "configChanged":
            // Bump a separate revision so computed refs that depend on config
            // (fallbackLocale, namespace activation without a loader, etc.) re-evaluate
            // without interfering with _cacheRevision's sync to the real cache.
            this._configRevision.value++;
            break;
        }
      }),
    );

    // Explicit proxy bindings for spyability
    this.addTranslations = core.addTranslations.bind(core);
    this.clearTranslations = core.clearTranslations.bind(core);
    this.on = core.on.bind(core);
    this.setFallbackLocale = core.setFallbackLocale.bind(core);
    this.setDefaultParams = core.setDefaultParams.bind(core);
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
              this.core.reportError(error, { source: "setLocale" });
            });
          }
        },
      });
    }
    return this._localeComputed;
  }

  set locale(value: string) {
    this.setLocale(value).catch((error) => {
      this.core.reportError(error, { source: "setLocale" });
    });
  }

  /** Reactive shallow snapshot of the current interpolation defaults. */
  get defaultParams(): ComputedRef<DefaultParamsSnapshot<D>> {
    if (!this._defaultParamsComputed) {
      this._defaultParamsComputed = computed(() => {
        void this._configRevision.value;
        return this.core.defaultParams;
      });
    }
    return this._defaultParamsComputed;
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
        return this.core.getLoadedLocales();
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
        return this.core.getActiveNamespaces();
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
        return this.core.getDefaultNamespace();
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
      return this.core.hasTranslation(key, opts?.locale, opts?.namespace, opts?.checkFallbacks);
    });
  }

  /**
   * Reactive check for locale availability. Returns a ComputedRef that
   * re-evaluates when the translation cache changes.
   */
  hasLocale(locale: string, namespace?: string): ComputedRef<boolean> {
    return computed(() => {
      void this._cacheRevision.value;
      return this.core.hasLocale(locale, namespace);
    });
  }

  /** Imperative (non-reactive) translation-existence check — plain boolean, for use outside a reactive scope. */
  hasTranslationNow(
    key: string,
    opts?: { locale?: string; namespace?: string; checkFallbacks?: boolean },
  ): boolean {
    return this.core.hasTranslation(key, opts?.locale, opts?.namespace, opts?.checkFallbacks);
  }

  /** Imperative (non-reactive) locale-availability check — plain boolean, for use outside a reactive scope. */
  hasLocaleNow(locale: string, namespace?: string): boolean {
    return this.core.hasLocale(locale, namespace);
  }

  async setLocale(locale: string): Promise<void> {
    const target = locale;
    this._requestedLocale = target;
    const run = async () => {
      if (this.core.locale !== target) {
        await this.core.setLocaleAsync(target);
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
        this._requestedLocale = this.core.locale;
      }
      throw error;
    }
  }

  get translationCache(): ComputedRef<ReadonlyMap<string, FlattenedTranslations>> {
    if (!this._translationCacheComputed) {
      this._translationCacheComputed = computed(() => {
        void this._cacheRevision.value;
        return this.core.translationCache.getInternalMap();
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
  >(key: K, ...params: import("@comvi/core").NamespacedParamsArg<NS, K, D>): TranslationResult;

  /** Raw translation result for typed keys. */
  tRaw<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K, D>
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
    return this.core.tRaw(key as any, ...(params as any));
  }

  /**
   * Translate a namespaced key (when ns is provided). Always returns plain text.
   */
  t<
    NS extends import("@comvi/core").Namespaces,
    K extends import("@comvi/core").NamespacedKeys<NS>,
  >(key: K, ...params: import("@comvi/core").NamespacedParamsArg<NS, K, D>): string;

  /**
   * Translate a key with Vue reactivity tracking - typed keys. Always returns plain text.
   */
  t<K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K, D>
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
    await this.core.init();
    return this;
  }

  /**
   * Register a core plugin (chainable).
   *
   * Plugin registration is a `@comvi/core/plugins` capability: on a host
   * composed without it this throws `missingCapability("plugins")` — in dev
   * and in prod (framework-slim §2.4). The root entry and
   * `attachPlugins(...)` hosts always have it.
   */
  use(plugin: I18nPlugin, options?: Parameters<I18nPluginHostApi["use"]>[1]): this {
    const core = this.core;
    if (!hasPluginHostApi(core)) throw missingCapability("plugins");
    core.use(plugin, options);
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

    this.core.destroy().catch((error) => {
      this.core.reportError(error, { source: "plugin-cleanup" });
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

    if (!this.core.isInitialized && !this.core.isInitializing) {
      this.init().catch((error) => {
        this.core.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "init",
        });
      });
    }

    // `provide` and `$i18n` are ambient channels: the consumer cannot know
    // this instance's `D` or host type, so both erase to `AnyVueI18n` — the
    // same erasure the injection key declares (framework-slim §3.2).
    const ambient = this as unknown as AnyVueI18n;
    app.provide(I18N_INJECTION_KEY, ambient);
    app.config.globalProperties.$i18n = ambient;
    app.config.globalProperties.$t = this.t;
    app.config.globalProperties.$tRaw = this.tRaw;
  }
}

/**
 * The instance shape ambient consumers see — `inject(I18N_INJECTION_KEY)` and
 * the `$i18n` global property. Interpolation defaults (`D`) and the host type
 * (`C`) are both erased there: a component is written against whatever the
 * app installed, so it gets the capability-free host surface and must acquire
 * capabilities through `useI18nLoader()` / `useI18nPlugins()`.
 */
export type AnyVueI18n = VueI18n<{}, WrapperI18nHost>;

declare module "vue" {
  export interface ComponentCustomProperties {
    $t: VueI18n["t"];
    $tRaw: VueI18n["tRaw"];
    $i18n: AnyVueI18n;
  }
}
