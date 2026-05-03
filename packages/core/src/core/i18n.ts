import type {
  I18nOptions,
  I18nInstance,
  FlattenedTranslations,
  TranslationValue,
  TranslationResult,
  TranslationParams,
  PostProcessFn,
  I18nEvent,
  I18nEventData,
  TranslationKeys,
  ParamsArg,
  Namespaces,
  NamespacedKeys,
  NamespacedParamsArg,
  PermissiveKey,
  ErrorReportContext,
  TagInterpolationOptions,
} from "../types";
import { DEFAULT_NS, COMVI_REPORTED } from "../constants";
import { warn } from "../logger";
import { normalizeTranslationObject } from "../utils";
import { translationResultToString } from "../utils/translationResultToString";
import type { I18nPlugin as I18nPluginFn } from "../plugins/types";
import { TranslationCache } from "./TranslationCache";
import type { PluginOptions } from "../plugins/types";
import { clearTemplateCache, isStaticTemplate, translate, translateTemplate } from "./translate";

declare const __DEV__: boolean | undefined;
declare const __VERSION__: string | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// Declare process for bundler replacement (webpack/turbopack/vite replace process.env.NODE_ENV at build time)
declare const process: { env?: { NODE_ENV?: string } } | undefined;

/** Library version - injected at build time or fallback */
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.1.0";
const ERR_LOCALE_NOT_SET = IS_DEV ? "@comvi/core: Locale is not set" : "E_LOCALE_NOT_SET";
const ERR_TRANSLATION_NOT_OBJECT = IS_DEV
  ? "@comvi/core: Translation is not an object"
  : "E_TRANSLATION_NOT_OBJECT";
const ERR_NO_LOADER_REGISTERED = IS_DEV
  ? "[i18n] No loader registered. Cannot reload translations."
  : "E_NO_LOADER_REGISTERED";
const ERR_FAILED_RELOAD_TRANSLATIONS = IS_DEV
  ? "[i18n] Failed to reload translations"
  : "E_FAILED_RELOAD_TRANSLATIONS";
const ERR_INSTANCE_DESTROYED = IS_DEV
  ? "[i18n] Cannot call init() after destroy(). Create a new i18n instance."
  : "E_INSTANCE_DESTROYED";

function createPartialNamespaceLoadError(
  locale: string,
  failedCount: number,
  totalCount: number,
  failedNamespaces: string,
): Error {
  if (IS_DEV) {
    return new Error(
      `[i18n] Partial namespace load failure for "${locale}": ` +
        `${failedCount}/${totalCount} failed (${failedNamespaces})`,
    );
  }
  return new Error("E_PARTIAL_NAMESPACE_LOAD");
}

function createAllNamespacesFailedError(locale: string, failedNamespaces: string): Error {
  if (IS_DEV) {
    return new Error(
      `[i18n] Failed to load all namespaces for locale "${locale}": ${failedNamespaces}`,
    );
  }
  return new Error("E_ALL_NAMESPACES_FAILED");
}
const ERR_REGISTER_LOCALE_DETECTOR = IS_DEV
  ? "[i18n] registerLocaleDetector(): argument must be a function."
  : "E_REGISTER_LOCALE_DETECTOR";
const ERR_REGISTER_LOADER_ARG = IS_DEV
  ? "[i18n] registerLoader(): argument must be a function or an import map."
  : "E_REGISTER_LOADER_ARG";

type LoaderResult = Record<string, TranslationValue>;
type LoaderImportResult = LoaderResult | { default: LoaderResult };
type LoaderFn = (locale: string, namespace: string) => Promise<LoaderResult>;
type LoaderImportMap = Record<string, () => Promise<LoaderImportResult>>;

type PluginEntry = [
  plugin: I18nPluginFn,
  required: boolean,
  timeout: number,
  onError?: (error: Error) => void,
];

/** Counter for auto-generating instance IDs */
let instanceCounter = 0;

function createImportMapLoader(importMap: LoaderImportMap, getDefaultNs: () => string): LoaderFn {
  return async (locale, namespace) => {
    const defaultNs = getDefaultNs();
    const key = `${locale}:${namespace}`;
    const importFn = importMap[key] ?? (namespace === defaultNs ? importMap[locale] : undefined);
    if (!importFn) {
      throw new Error(
        IS_DEV ? `[i18n] registerLoader: no entry for "${key}"` : "E_REGISTER_LOADER_ENTRY",
      );
    }
    const result = await importFn();
    return "default" in result ? (result as { default: LoaderResult }).default : result;
  };
}

function ensureGlobalRegistry(): NonNullable<Window["__COMVI__"]> {
  const current = window.__COMVI__;
  if (current) {
    return current;
  }

  const instances = new Map<string, I18n>();
  const registry: NonNullable<Window["__COMVI__"]> = {
    version: VERSION,
    instances,
    register: (id, instance) => {
      instances.set(id, instance);
      window.__COMVI__?.onInstanceRegistered?.(id, instance);
      window.dispatchEvent(
        new CustomEvent("COMVI_READY", {
          detail: {
            version: VERSION,
            instanceCount: instances.size,
            instanceId: id,
          },
        }),
      );
    },
    unregister: (id) => {
      instances.delete(id);
    },
    get: (id) => {
      if (id) return instances.get(id);
      return instances.values().next().value as I18n | undefined;
    },
  };

  window.__COMVI__ = registry;
  return registry;
}

/**
 * I18n is the main entry point for the i18n system.
 * It acts as a Facade coordinating three specialized managers:
 * - NamespaceManager: Handles namespace loading and tracking
 * - Internal plugin lifecycle runtime: Handles plugin init/cleanup and error recovery
 */
export class I18n implements I18nInstance {
  // Core state
  private _locale: string;
  public readonly translationCache: TranslationCache;
  private _isInitializing: boolean = false;
  private _isInitialized: boolean = false;
  private _isDestroyed: boolean = false;
  private _loadingCount: number = 0;
  private _fallbackLocales: string[];
  private _currentLocaleChangeId: number = 0;
  public readonly apiKey: string | undefined;
  public readonly devMode: boolean;
  public readonly instanceId: string | undefined;
  private _cachedDefaultNs: string;
  private _initialNamespaces?: string[];
  private _strict: "dev" | "off";
  private _tagInterpolation?: TagInterpolationOptions;
  private _postProcessors: PostProcessFn[] = [];
  private _hasPostProcessors: boolean = false;
  private _primaryTranslations?: FlattenedTranslations;
  private _primaryTranslationsRevision: number = -1;
  private _primaryTranslationsLocale: string = "";
  private _primaryTranslationsNamespace: string = "";

  // Namespace state (inlined from NamespaceManager)
  private _activeNamespaces = new Set<string>();
  private _nsGeneration = 0;
  private _pendingLoads: Record<string, Promise<void> | undefined> = Object.create(null);
  private _loader?: LoaderFn;

  // Plugin state
  private _plugins: PluginEntry[] = [];
  private _pluginCleanups: Array<() => void | Promise<void>> = [];

  // Plugin API hooks
  private _localeDetector?: () => string | Promise<string>;
  private _missingKeyCallbacks = new Set<
    (key: string, locale: string, namespace: string) => TranslationResult | void
  >();

  // Event system for framework wrappers and plugins
  private _eventCallbacks: Partial<Record<I18nEvent, Set<(data?: unknown) => void>>> =
    Object.create(null);

  // Plugin data storage (for plugins to store config that persists with instance)
  private _pluginData: Record<string, unknown> = Object.create(null);

  // Options storage
  private _fallbackOnMissingKey?: (info: {
    key: string;
    locale: string;
    namespace: string;
  }) => TranslationResult | void;
  private _onError?: (error: Error, context?: ErrorReportContext) => void;

  constructor(options: I18nOptions) {
    if (!options.locale) {
      throw new Error(ERR_LOCALE_NOT_SET);
    }

    // Initialize core state
    this._locale = options.locale;
    const defaultNs = options.defaultNs ?? DEFAULT_NS;
    const initialNamespaces = options.ns;
    this._cachedDefaultNs = defaultNs;
    this.translationCache = new TranslationCache({ defaultNs });
    this._initialNamespaces = initialNamespaces ? [...new Set(initialNamespaces)] : undefined;

    const fallbackLocale = options.fallbackLocale;
    this._fallbackLocales =
      typeof fallbackLocale === "string" ? [fallbackLocale] : (fallbackLocale ?? []);

    this._fallbackOnMissingKey = options.onMissingKey;
    this._onError = options.onError;
    this._strict = options.strict ?? "off";

    const tagInterpolation = options.tagInterpolation
      ? {
          ...options.tagInterpolation,
          onTagWarning:
            options.tagInterpolation.onTagWarning ??
            ((tagName: string) => {
              this.reportError(
                new Error(
                  IS_DEV ? `Missing handler for tag: <${tagName}>` : "E_MISSING_TAG_HANDLER",
                ),
                {
                  source: "translation",
                  tagName,
                },
              );
            }),
        }
      : undefined;
    this._tagInterpolation = tagInterpolation;
    if (options.postProcess) {
      this._postProcessors.push(options.postProcess);
      this._hasPostProcessors = true;
    }

    // Validate and process initial translations if provided
    if (options.translation !== undefined) {
      if (
        typeof options.translation !== "object" ||
        options.translation === null ||
        Array.isArray(options.translation)
      ) {
        throw new Error(ERR_TRANSLATION_NOT_OBJECT);
      }

      // Validate all translation values are objects (only in DEV for performance)
      if (IS_DEV) {
        for (const key in options.translation) {
          const value = options.translation[key];
          if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error(ERR_TRANSLATION_NOT_OBJECT);
          }
        }
      }

      // Initialize namespaces from provided translations
      this._nsAddTranslations(options.translation);
    }

    // Store API key for plugins to use
    this.apiKey = options.apiKey;

    // Determine development mode
    this.devMode =
      options.devMode ??
      (typeof process !== "undefined" && process?.env?.NODE_ENV !== "production");

    // Register on global window.__COMVI__ for browser extensions
    // Default to true in browser environments, false in SSR
    const shouldExpose = options.exposeGlobal ?? typeof window !== "undefined";
    if (shouldExpose) {
      this.instanceId = options.instanceId || `comvi-${++instanceCounter}`;
      if (typeof window !== "undefined") {
        ensureGlobalRegistry().register(this.instanceId, this);
      }
    }
  }

  /**
   * Initialize Comvi i18n - executes plugins and loads translations
   */
  public async init(): Promise<this> {
    try {
      if (this._isDestroyed) {
        throw new Error(ERR_INSTANCE_DESTROYED);
      }

      if (this.instanceId && typeof window !== "undefined") {
        const registry = ensureGlobalRegistry();
        if (registry.get(this.instanceId) !== this) {
          registry.register(this.instanceId, this);
        }
      }

      this._setLoadingState(true, true);

      await this._initializePlugins();

      // Call locale detector if one was registered by plugins
      if (this._localeDetector) {
        const detectedLocale = await this._localeDetector();
        if (detectedLocale && detectedLocale !== this._locale) {
          // Use async method to wait for namespace loading
          await this.setLocaleAsync(detectedLocale);
        }
      }

      const namespacesToLoad = this._initialNamespaces ?? [this._cachedDefaultNs];
      if (namespacesToLoad.length > 0) {
        await this._nsAddActiveNamespaces(namespacesToLoad);
      }

      this._isInitialized = true;
      this._emit("initialized");
      return this;
    } catch (error) {
      this.reportError(error as Error, { source: "init" });
      throw error;
    } finally {
      this._setLoadingState(false, false);
    }
  }

  /**
   * Register a plugin (chainable)
   * @param plugin - The plugin to register
   * @param options - Plugin options (required, timeout, onError)
   * @returns this for chaining
   */
  use(plugin: I18nPluginFn, options?: PluginOptions): this {
    this._plugins.push([
      plugin,
      options?.required ?? true,
      options?.timeout ?? 10000,
      options?.onError,
    ]);
    return this;
  }

  private async _initializePlugins(): Promise<void> {
    for (const [plugin, required, timeout, onError] of this._plugins) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          plugin(this),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () =>
                reject(
                  new Error(
                    IS_DEV
                      ? `Plugin initialization timed out after ${timeout}ms`
                      : "E_PLUGIN_INIT_TIMEOUT",
                  ),
                ),
              timeout,
            );
          }),
        ]);
        if (typeof result === "function") {
          this._pluginCleanups.push(result);
        }
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error(
                IS_DEV ? `Plugin initialization failed: ${String(error)}` : "E_PLUGIN_INIT_FAILED",
              );

        if (onError) {
          try {
            onError(err);
          } catch (handlerError) {
            if (IS_DEV) {
              warn(`[i18n] Plugin error handler failed: ${(handlerError as Error).message}`);
            }
          }
        }

        this.reportError(err, { source: "plugin", pluginName: plugin.name || "anonymous" });
        if (required) {
          throw err;
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Subscribe to a specific i18n event
   * @param event - Event name to subscribe to
   * @param callback - Event handler function
   * @returns Unsubscribe function
   */
  public on<E extends I18nEvent>(event: E, callback: (data: I18nEventData[E]) => void): () => void {
    let callbacks = this._eventCallbacks[event];
    if (!callbacks) {
      callbacks = new Set();
      this._eventCallbacks[event] = callbacks;
    }
    callbacks.add(callback as (data?: unknown) => void);

    return () => {
      const currentCallbacks = this._eventCallbacks[event];
      if (currentCallbacks) {
        currentCallbacks.delete(callback as (data?: unknown) => void);
        if (currentCallbacks.size === 0) {
          delete this._eventCallbacks[event];
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers
   * @private
   */
  private _emit<E extends I18nEvent>(event: E, data?: I18nEventData[E]): void {
    const callbacks = this._eventCallbacks[event];
    if (!callbacks) return;

    for (const fn of callbacks) {
      try {
        fn(data);
      } catch (error) {
        this.reportError(error, { source: "event", event });
      }
    }
  }

  get locale(): string {
    return this._locale;
  }

  set locale(value: string) {
    // Synchronous setter - fires and forgets namespace loading
    this.setLocaleAsync(value).catch((error) => {
      // Emit error event so apps can handle failures in production
      this._emit("loadError", {
        locale: value,
        namespace: "locale-change",
        error: error as Error,
      });
      // Already reported via reportError (dev fallback); avoid duplicate log
    });
  }

  /**
   * Set locale and wait for namespaces to load
   * @param value - The locale code to set
   * @returns Promise that resolves when namespace loading is complete
   */
  async setLocaleAsync(value: string): Promise<void> {
    if (this._locale === value) return; // Early exit if no change

    // Track this request to handle race conditions when locale changes rapidly
    const changeId = ++this._currentLocaleChangeId;

    this._setLoadingState(true, false);

    try {
      // Load any active namespaces that aren't loaded for the new locale FIRST
      // This ensures we don't switch locale before translations are ready (preventing UI flash)
      if (this._loader && this._activeNamespaces.size > 0) {
        await this._nsLoadNamespacesForLocale(value, [...this._activeNamespaces], true);
      }

      // Check staleness after EVERY async operation to prevent applying outdated results
      if (changeId !== this._currentLocaleChangeId) {
        return;
      }

      // Switch locale only after successful load
      const oldLocale = this._locale;
      this._locale = value;
      this._emit("localeChanged", { from: oldLocale, to: value });
    } catch (error) {
      // Re-check staleness: if a newer request superseded this one, suppress the error
      // so only the latest request's outcome is observed by callers
      if (changeId !== this._currentLocaleChangeId) {
        return;
      }
      throw error;
    } finally {
      // ALWAYS decrement the loading state because we incremented it unconditionally.
      // The reference counter handles overlapping requests seamlessly.
      this._setLoadingState(false, false);
    }
  }

  setFallbackLocale(fallback: string | string[]) {
    this._fallbackLocales = typeof fallback === "string" ? [fallback] : fallback;
  }

  /**
   * Clear translations from cache
   * @param locale - Optional locale to clear (if not provided, clears all locales)
   * @param namespace - Optional namespace to clear (if not provided, clears all namespaces)
   */
  clearTranslations(locale?: string, namespace?: string): void {
    if (locale) {
      this.translationCache.delete(locale, namespace);
    } else if (namespace) {
      for (const loc of this.translationCache.getLocales()) {
        this.translationCache.delete(loc, namespace);
      }
    } else {
      this.translationCache.clear();
    }

    if (!locale && namespace) {
      this._activeNamespaces.delete(namespace);
    } else if (!locale && !namespace) {
      this._activeNamespaces.clear();
    }

    // Clear template compilation cache to free memory
    clearTemplateCache();

    this._emit("translationsCleared", { locale, namespace });
  }

  /**
   * Add translations to the cache programmatically
   * @param translations - Object with locale codes as keys, translation objects as values
   */
  addTranslations(translations: Record<string, Record<string, TranslationValue>>) {
    this._nsAddTranslations(translations);
  }

  getTranslations(locale: string = this._locale, namespace: string = this._cachedDefaultNs) {
    return this.translationCache.get(locale, namespace) ?? {};
  }

  hasLocale(locale: string, namespace?: string): boolean {
    return this.translationCache.has(locale, namespace ?? this._cachedDefaultNs);
  }

  hasTranslation(
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks: boolean = false,
  ): boolean {
    const loc = locale ?? this._locale;
    const ns = namespace ?? this._cachedDefaultNs;
    const translations =
      loc === this._locale && ns === this._cachedDefaultNs
        ? this._getPrimaryTranslations()
        : this.translationCache.get(loc, ns);
    if (translations !== undefined && translations[key] !== undefined) {
      return true;
    }
    if (checkFallbacks) {
      for (const fallbackLoc of this._fallbackLocales) {
        if (fallbackLoc === loc) continue;
        const fallbackTranslations = this.translationCache.get(fallbackLoc, ns);
        if (fallbackTranslations !== undefined && fallbackTranslations[key] !== undefined) {
          return true;
        }
      }
    }
    return false;
  }

  get isLoading(): boolean {
    return this._loadingCount > 0;
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  /**
   * Whether Comvi i18n has been initialized (init() has been called successfully)
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Helper to update loading state and emit event.
   * Uses a reference counter to handle overlapping async operations.
   */
  private _setLoadingState(isLoading: boolean, isInitializing: boolean): void {
    const wasLoading = this._loadingCount > 0;
    if (isLoading) {
      this._loadingCount++;
    } else {
      this._loadingCount = Math.max(0, this._loadingCount - 1);
    }

    const effectiveIsLoading = this._loadingCount > 0;

    if (wasLoading !== effectiveIsLoading || this._isInitializing !== isInitializing) {
      this._isInitializing = isInitializing;
      this._emit("loadingStateChanged", { isLoading: effectiveIsLoading, isInitializing });
    }
  }

  setDefaultNamespace(namespace: string) {
    const previousNamespace = this._cachedDefaultNs;
    if (previousNamespace === namespace) {
      return;
    }

    this._cachedDefaultNs = namespace;
    this._emit("defaultNamespaceChanged", { from: previousNamespace, to: namespace });
  }

  getDefaultNamespace(): string {
    return this._cachedDefaultNs;
  }

  getActiveNamespaces(): string[] {
    return [...this._activeNamespaces];
  }

  /**
   * Store plugin-specific data on the i18n instance.
   * This allows plugins to store configuration that persists with the instance.
   */
  setPluginData(key: string, data: unknown): void {
    this._pluginData[key] = data;
  }

  /**
   * Retrieve plugin-specific data from the i18n instance.
   */
  getPluginData<T = unknown>(key: string): T | undefined {
    return this._pluginData[key] as T | undefined;
  }

  async addActiveNamespace(namespace: string): Promise<void> {
    return this.addActiveNamespaces([namespace]);
  }

  async addActiveNamespaces(namespaces: string[]): Promise<void> {
    this._setLoadingState(true, false);
    try {
      await this._nsAddActiveNamespaces(namespaces);
    } finally {
      this._setLoadingState(false, false);
    }
  }

  /**
   * Reload translations from the remote loader.
   * Clears the current cache and attempts to fetch fresh translations.
   *
   * @param locale - Optional locale to reload (defaults to current + fallbacks)
   * @param namespace - Optional namespace to reload (defaults to all active)
   * @throws {Error} Throws if all reload attempts fail, indicating the cache may be empty.
   */
  async reloadTranslations(locale?: string, namespace?: string): Promise<void> {
    return this._nsReloadTranslations(locale, namespace);
  }

  /**
   * Register a post-processor function
   * Post-processors are chained in the order they are registered (FIFO)
   * @param fn - The post-processor function to register
   */
  registerPostProcessor(fn: PostProcessFn): void {
    if (typeof fn !== "function") {
      throw new Error(
        IS_DEV
          ? `[i18n] registerPostProcessor(): argument must be a function. Received: ${typeof fn}`
          : "E_REGISTER_POST_PROCESSOR",
      );
    }
    this._postProcessors.push(fn);
    this._hasPostProcessors = true;
  }

  /**
   * Translate a namespaced key (when ns is provided)
   */
  tRaw<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    translationKey: K | null,
    ...params: NamespacedParamsArg<NS, K>
  ): TranslationResult;

  /**
   * Translate a key with typed params
   */
  tRaw<K extends keyof TranslationKeys>(
    translationKey: K | null,
    ...params: ParamsArg<K>
  ): TranslationResult;

  /**
   * Permissive overload - only active when TranslationKeys is empty
   */
  tRaw(translationKey: PermissiveKey | null, params?: TranslationParams): TranslationResult;

  /**
   * Implementation
   */
  tRaw(translationKey: string | null, ...params: [TranslationParams?]): TranslationResult {
    if (translationKey === null) {
      return "";
    }

    const key = translationKey as string;
    const userParams = params[0];

    // Fast-path for known static templates (no params, no post-processors)
    if (userParams == null && !this._hasPostProcessors) {
      const translations = this._getPrimaryTranslations();
      if (translations !== undefined) {
        const template = translations[key];
        if (template !== undefined && isStaticTemplate(template) === true) {
          return template;
        }
      }
    }

    return this._translate(
      key,
      this._locale,
      this._cachedDefaultNs,
      this._fallbackLocales,
      userParams,
    );
  }

  /**
   * Translate a namespaced key (when ns is provided)
   */
  t<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    translationKey: K | null,
    ...params: NamespacedParamsArg<NS, K>
  ): string;

  /**
   * Translate a key with typed params
   */
  t<K extends keyof TranslationKeys>(translationKey: K | null, ...params: ParamsArg<K>): string;

  /**
   * Permissive overload - only active when TranslationKeys is empty
   */
  t(translationKey: PermissiveKey | null, params?: TranslationParams): string;

  /**
   * Implementation
   */
  t(translationKey: string | null, ...params: [TranslationParams?]): string {
    return translationResultToString(this.tRaw(translationKey as any, ...(params as any)));
  }

  private _getPrimaryTranslations(): FlattenedTranslations | undefined {
    const revision = this.translationCache.getRevision();
    if (
      this._primaryTranslationsRevision === revision &&
      this._primaryTranslationsLocale === this._locale &&
      this._primaryTranslationsNamespace === this._cachedDefaultNs
    ) {
      return this._primaryTranslations;
    }

    const translations = this.translationCache.get(this._locale, this._cachedDefaultNs);
    this._primaryTranslations = translations;
    this._primaryTranslationsRevision = revision;
    this._primaryTranslationsLocale = this._locale;
    this._primaryTranslationsNamespace = this._cachedDefaultNs;
    return translations;
  }

  private _translate(
    translationKey: string,
    currentLocale: string,
    defaultNamespace: string,
    fallbackLocales: string[],
    params?: TranslationParams,
  ): TranslationResult {
    const hasParams = params != null;
    const locale = hasParams && params.locale !== undefined ? params.locale : currentLocale;
    const namespace = hasParams && params.ns !== undefined ? params.ns : defaultNamespace;
    const skipPostProcess = !this._hasPostProcessors;

    const translations =
      locale === this._locale && namespace === this._cachedDefaultNs
        ? this._getPrimaryTranslations()
        : this.translationCache.get(locale, namespace);
    const template = translations?.[translationKey];
    if (template !== undefined) {
      const result = translate(template, locale, params, this._tagInterpolation);
      return skipPostProcess
        ? result
        : this._postProcess(result, translationKey, namespace, params);
    }

    for (const fallbackLoc of fallbackLocales) {
      const fallbackTranslations = this.translationCache.get(fallbackLoc, namespace);
      const fallbackTemplate = fallbackTranslations?.[translationKey];
      if (fallbackTemplate !== undefined) {
        const result = translate(fallbackTemplate, fallbackLoc, params, this._tagInterpolation);
        return skipPostProcess
          ? result
          : this._postProcess(result, translationKey, namespace, params);
      }
    }

    const missingResult = this._handleMissingTranslation(translationKey, locale, namespace, params);
    return skipPostProcess
      ? missingResult
      : this._postProcess(missingResult, translationKey, namespace, params);
  }

  private _postProcess(
    result: TranslationResult,
    key: string,
    namespace: string,
    params?: TranslationParams,
  ): TranslationResult {
    const safeParams = params ?? {};
    let acc = result;
    for (let i = 0; i < this._postProcessors.length; i++) {
      try {
        acc = this._postProcessors[i](acc, key, namespace, safeParams);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.reportError(err, { source: "post-processor", key, namespace });
      }
    }
    return acc;
  }

  private _handleMissingTranslation(
    key: string,
    locale: string,
    namespace: string,
    params?: TranslationParams,
  ): TranslationResult {
    if (this._strict === "dev") {
      warn(IS_DEV ? `[i18n] Translation not found: "${key}"` : "E_TRANSLATION_NOT_FOUND", {
        key,
        locale,
        namespace,
      });
    }

    this._emit("missingKey", { key, locale, namespace });

    let fallbackValue: TranslationResult | undefined;
    for (const callback of this._missingKeyCallbacks) {
      const result = callback(key, locale, namespace);
      if (fallbackValue === undefined && result !== undefined) {
        fallbackValue = result;
      }
    }
    if (fallbackValue === undefined) {
      const r = this._fallbackOnMissingKey?.({ key, locale, namespace });
      if (r !== undefined) fallbackValue = r;
    }

    if (params?.fallback !== undefined) {
      return translateTemplate(params.fallback, params, locale, this._tagInterpolation);
    }

    return fallbackValue !== undefined ? fallbackValue : key;
  }

  /**
   * Register a locale detector function
   * Used by plugins to provide automatic locale detection
   */
  public registerLocaleDetector(detector: () => string | Promise<string>): void {
    if (typeof detector !== "function") {
      throw new Error(ERR_REGISTER_LOCALE_DETECTOR);
    }
    this._localeDetector = detector;
  }

  /**
   * Get the registered locale detector function
   */
  public getLanguageDetector(): (() => string | Promise<string>) | undefined {
    return this._localeDetector;
  }

  /**
   * Register a translation loader.
   *
   * Accepts either a loader function or a static map of import functions:
   *
   * @example Function loader
   * ```typescript
   * i18n.registerLoader(async (locale, namespace) => {
   *   const res = await fetch(`/locales/${locale}/${namespace}.json`);
   *   return res.json();
   * });
   * ```
   *
   * @example Static import map
   * ```typescript
   * i18n.registerLoader({
   *   'en': () => import('./locales/en/default.json'),
   *   'en:dashboard': () => import('./locales/en/dashboard.json'),
   *   'fr': () => import('./locales/fr/default.json'),
   * });
   * ```
   *
   * Keys without `:` are expanded to `"locale:defaultNs"`.
   * The `{ default: ... }` wrapper from dynamic `import()` is unwrapped automatically.
   */
  public registerLoader(loader: LoaderFn | LoaderImportMap): void {
    if (typeof loader === "function") {
      this._loader = loader;
      return;
    }

    if (typeof loader !== "object" || loader === null) {
      throw new Error(ERR_REGISTER_LOADER_ARG);
    }

    this._loader = createImportMapLoader(loader, () => this._cachedDefaultNs);
  }

  /**
   * Get the registered loader function
   */
  public getLoader(): LoaderFn | undefined {
    return this._loader;
  }

  /**
   * Register a callback for missing translation keys
   * @param callback - Function called when a key is missing. Can return a string to use as fallback.
   * @returns Cleanup function to remove the callback
   */
  public onMissingKey(
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ): () => void {
    this._missingKeyCallbacks.add(callback);
    return () => void this._missingKeyCallbacks.delete(callback);
  }

  /**
   * Register a callback for load errors
   * @param callback - Function called when loading translations fails
   * @returns Cleanup function to remove the callback
   */
  public onLoadError(
    callback: (locale: string, namespace: string, error: Error) => void,
  ): () => void {
    return this.on("loadError", ({ locale, namespace, error }) =>
      callback(locale, namespace, error),
    );
  }

  /**
   * Get all loaded locale codes (for debugging)
   * @returns Array of locale codes that have translations loaded
   */
  public getLoadedLocales(): string[] {
    return this.translationCache.getLocales();
  }

  /**
   * Report an error to the configured onError handler (if any).
   * In dev mode, falls back to warn() when onError is not configured.
   * Marks the error with COMVI_REPORTED to prevent double-reporting when rethrown.
   */
  public reportError(error: unknown, context?: ErrorReportContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const e = err as Error & { [key: symbol]: boolean };
    if (e[COMVI_REPORTED]) return;
    e[COMVI_REPORTED] = true;

    if (this._onError) {
      try {
        this._onError(err, context);
      } catch (e) {
        if (IS_DEV) {
          warn(`[i18n] onError handler threw: ${(e as Error).message}`);
        }
      }
    } else if (IS_DEV) {
      const ctx = context?.source ?? "unknown";
      const parts = [
        context?.pluginName,
        context?.tagName,
        context?.event,
        context?.key,
        context?.locale,
        context?.namespace,
      ].filter(Boolean);
      const detail = parts.length ? parts.join(", ") : undefined;
      warn(`[i18n] ${ctx}${detail ? ` (${detail})` : ""}: ${err.message}`);
    }
  }

  // ── Namespace management (inlined from NamespaceManager) ──

  private _nsLoadNamespace(locale: string, namespace: string): Promise<void> {
    const key = `${locale}:${namespace}`;
    const existing = this._pendingLoads[key];
    if (existing) {
      return existing;
    }

    const generation = this._nsGeneration;
    const loader = this._loader!;

    const rawPromise = (async () => {
      const translations = await loader(locale, namespace);
      if (generation !== this._nsGeneration) return;
      this.translationCache.set(locale, namespace, normalizeTranslationObject(translations));
      this._emit("namespaceLoaded", { namespace, locale });
    })();

    // Wrap with generation guard and cleanup — this is the promise all callers share
    const guarded = rawPromise.then(
      () => {
        if (this._pendingLoads[key] === guarded) {
          delete this._pendingLoads[key];
        }
      },
      (error) => {
        if (this._pendingLoads[key] === guarded) {
          delete this._pendingLoads[key];
        }
        if (generation !== this._nsGeneration) return;
        this._emit("loadError", { locale, namespace, error: error as Error });
        throw error;
      },
    );

    this._pendingLoads[key] = guarded;
    return guarded;
  }

  private async _nsLoadNamespacesForLocale(
    locale: string,
    namespaces: string[],
    skipLoaded: boolean = true,
  ): Promise<void> {
    if (!this._loader) return;

    const namespacesToLoad = skipLoaded
      ? namespaces.filter((ns) => !this.translationCache.has(locale, ns))
      : namespaces;

    if (namespacesToLoad.length === 0) return;

    const failedNamespacesList: string[] = [];
    await Promise.all(
      namespacesToLoad.map((ns) =>
        this._nsLoadNamespace(locale, ns).catch(() => {
          failedNamespacesList.push(ns);
        }),
      ),
    );

    if (failedNamespacesList.length === 0) return;

    const failedNamespaces = failedNamespacesList.join(", ");

    const nsCtx = { source: "namespace-load" as const, locale, namespace: failedNamespaces };
    if (failedNamespacesList.length < namespacesToLoad.length) {
      this.reportError(
        createPartialNamespaceLoadError(
          locale,
          failedNamespacesList.length,
          namespacesToLoad.length,
          failedNamespaces,
        ),
        nsCtx,
      );
      return;
    }

    const err = createAllNamespacesFailedError(locale, failedNamespaces);
    this.reportError(err, nsCtx);
    throw err;
  }

  private async _nsAddActiveNamespaces(namespaces: string[]): Promise<void> {
    // Add to active set optimistically. If the load fails, the namespace
    // stays active so it will be retried automatically on the next locale
    // switch — this matches caller expectations and avoids forcing manual retry.
    for (const ns of namespaces) this._activeNamespaces.add(ns);
    await this._nsLoadNamespacesForLocale(this._locale, namespaces, true);
  }

  private async _nsReloadTranslations(locale?: string, namespace?: string): Promise<void> {
    if (!this._loader) {
      throw new Error(ERR_NO_LOADER_REGISTERED);
    }

    const localesToReload = locale ? [locale] : [this._locale, ...this._fallbackLocales];
    const namespacesToReload = namespace ? [namespace] : [...this._activeNamespaces];

    for (const loc of localesToReload) {
      for (const ns of namespacesToReload) {
        this.translationCache.delete(loc, ns);
      }
    }

    const failures: Array<{ loc: string; reason: unknown }> = [];
    await Promise.all(
      localesToReload.map((loc) =>
        this._nsLoadNamespacesForLocale(loc, namespacesToReload, false).catch((reason) => {
          failures.push({ loc, reason });
        }),
      ),
    );

    if (failures.length === localesToReload.length) {
      const err = new Error(ERR_FAILED_RELOAD_TRANSLATIONS);
      this.reportError(err, { source: "namespace-load" });
      throw err;
    }
  }

  private _nsAddTranslations(translations: Record<string, Record<string, TranslationValue>>): void {
    for (const localeOrKey in translations) {
      const value = translations[localeOrKey];
      const flattenedTranslations = normalizeTranslationObject(value);

      const colonIdx = localeOrKey.indexOf(":");
      const loc = colonIdx === -1 ? localeOrKey : localeOrKey.slice(0, colonIdx);
      const ns = colonIdx === -1 ? this._cachedDefaultNs : localeOrKey.slice(colonIdx + 1);

      const existingTranslations = this.translationCache.get(loc, ns);
      if (existingTranslations !== undefined) {
        this.translationCache.set(
          loc,
          ns,
          Object.assign(Object.create(null), existingTranslations, flattenedTranslations),
        );
      } else {
        this.translationCache.set(loc, ns, flattenedTranslations);
      }

      this._activeNamespaces.add(ns);
      this._emit("namespaceLoaded", { namespace: ns, locale: loc });
    }
  }

  // ── Intl Formatting ─────────────────────────────────────────────────
  private _numberFormatCache = new Map<string, Intl.NumberFormat>();
  private _dateFormatCache = new Map<string, Intl.DateTimeFormat>();

  private _getNumberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = options ? JSON.stringify(options) : "";
    const cacheKey = this._locale + key;
    let fmt = this._numberFormatCache.get(cacheKey);
    if (!fmt) {
      fmt = new Intl.NumberFormat(this._locale, options);
      this._numberFormatCache.set(cacheKey, fmt);
    }
    return fmt;
  }

  private _getDateFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = options ? JSON.stringify(options) : "";
    const cacheKey = this._locale + key;
    let fmt = this._dateFormatCache.get(cacheKey);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat(this._locale, options);
      this._dateFormatCache.set(cacheKey, fmt);
    }
    return fmt;
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return this._getNumberFormat(options).format(value);
  }

  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return this._getDateFormat(options).format(value);
  }

  formatCurrency(value: number, currency: string, options?: Intl.NumberFormatOptions): string {
    return this._getNumberFormat({ ...options, style: "currency", currency }).format(value);
  }

  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string {
    return new Intl.RelativeTimeFormat(this._locale, options).format(value, unit);
  }

  /**
   * Text direction for the current locale ("ltr" or "rtl").
   * Use for HTML `dir` attribute or CSS logical properties.
   *
   * Uses `Intl.Locale.textInfo` (ES2023+) as the authoritative source,
   * which correctly handles script subtags and regional variants from CLDR.
   * Falls back to a script/language check on older runtimes.
   */
  get dir(): "ltr" | "rtl" {
    const locale = this._locale;
    try {
      const info = (
        new Intl.Locale(locale) as Intl.Locale & {
          textInfo?: { direction?: string };
        }
      ).textInfo;
      if (info?.direction === "rtl" || info?.direction === "ltr") {
        return info.direction;
      }
    } catch {
      // Invalid locale — fall through to the hardcoded check
    }
    // 1. Explicit RTL script subtag wins (e.g. "ku-Arab")
    if (/[-_](arab|hebr|thaa|syrc|nkoo|samr|mand|mend|rohg|adlm)([-_]|$)/i.test(locale)) {
      return "rtl";
    }
    // 2. Any other explicit script subtag means LTR (e.g. "ks-Deva", "ar-Latn")
    if (/^[a-z]{2,3}[-_][a-z]{4}([-_]|$)/i.test(locale)) {
      return "ltr";
    }
    // 3. No script subtag — use default direction by language code
    return /^(ar|arc|ckb|dv|fa|glk|he|khw|ks|lrc|mzn|pnb|ps|sd|syr|ug|ur|yi)([-_]|$)/i.test(locale)
      ? "rtl"
      : "ltr";
  }

  /**
   * Destroy Comvi i18n and clean up all resources
   */
  public async destroy(): Promise<void> {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;

    // Unregister from global __COMVI__
    if (this.instanceId && typeof window !== "undefined") {
      window.__COMVI__?.unregister(this.instanceId);
    }

    while (this._pluginCleanups.length > 0) {
      try {
        await this._pluginCleanups.pop()!();
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "plugin-cleanup",
        });
      }
    }
    // Reset lifecycle flags before tearing down event subscriptions so wrappers can react.
    const hadLoadingState = this._loadingCount > 0 || this._isInitializing;
    this._loadingCount = 0;
    this._isInitializing = false;
    this._isInitialized = false;

    if (hadLoadingState) {
      this._emit("loadingStateChanged", { isLoading: false, isInitializing: false });
    }
    this._emit("destroyed");

    this._eventCallbacks = {};
    this._missingKeyCallbacks.clear();

    this._nsGeneration++;
    this._activeNamespaces.clear();
    this._pendingLoads = {};
    this._loader = undefined;
    this._postProcessors = [];
    this._hasPostProcessors = false;

    // Clear cache and other state
    this.translationCache.clear();
    this._localeDetector = undefined;
    this._numberFormatCache.clear();
    this._dateFormatCache.clear();

    // Clear template compilation cache to free memory
    clearTemplateCache();
  }
}

/**
 * Create an i18n instance
 */
export function createI18n(options: I18nOptions): I18n {
  return new I18n(options);
}
