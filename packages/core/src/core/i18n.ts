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
  DefaultTranslationParams,
  SetDefaultParamsArg,
  DefaultParamsSnapshot,
} from "../types";
import { DEFAULT_NS, COMVI_REPORTED } from "../constants";
import { warn } from "../logger";
import { normalizeTranslationObject } from "../utils";
import {
  assertInterpolationDefaults,
  assertPreservesDefaultParamKeys,
} from "../utils/defaultParams";
import { translationResultToString } from "../utils/translationResultToString";
import type { I18nPlugin as I18nPluginFn } from "../plugins/types";
import { TranslationCache } from "./TranslationCache";
import type { PluginOptions } from "../plugins/types";
import { isStaticTemplate, translate, translateTemplate } from "./translate";

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
export class I18n<D extends DefaultTranslationParams = {}> implements I18nInstance<D> {
  // Core state
  #locale: string;
  public readonly translationCache: TranslationCache;
  #isInitializing: boolean = false;
  #isInitialized: boolean = false;
  #isDestroyed: boolean = false;
  #loadingCount: number = 0;
  #fallbackLocales: string[];
  #currentLocaleChangeId: number = 0;
  #requestedLocale: string;
  public readonly apiKey: string | undefined;
  public readonly collectContext: boolean | undefined;
  public readonly devMode: boolean;
  public readonly instanceId: string | undefined;
  #cachedDefaultNs: string;
  #initialNamespaces?: string[];
  #strict: "dev" | "off";
  #defaultParams?: DefaultTranslationParams;
  #guaranteedDefaultParamKeys: readonly string[];
  #configRevision = 0;
  #tagInterpolation?: TagInterpolationOptions;
  #postProcessors: PostProcessFn[] = [];
  #hasPostProcessors: boolean = false;
  #primaryTranslations?: FlattenedTranslations;
  #primaryTranslationsRevision: number = -1;
  #primaryTranslationsLocale: string = "";
  #primaryTranslationsNamespace: string = "";

  // Namespace state (inlined from NamespaceManager)
  #activeNamespaces = new Set<string>();
  #nsGeneration = 0;
  #pendingLoads: Record<string, Promise<void> | undefined> = Object.create(null);
  #loader?: LoaderFn;

  // Plugin state
  #plugins: PluginEntry[] = [];
  #pluginCleanups: Array<() => void | Promise<void>> = [];

  // Plugin API hooks
  #localeDetector?: () => string | Promise<string>;
  #missingKeyCallbacks = new Set<
    (key: string, locale: string, namespace: string) => TranslationResult | void
  >();

  // Event system for framework wrappers and plugins
  #eventCallbacks: Partial<Record<I18nEvent, Set<(data?: unknown) => void>>> = Object.create(null);

  // Plugin data storage (for plugins to store config that persists with instance)
  #pluginData: Record<string, unknown> = Object.create(null);

  // Options storage
  #fallbackOnMissingKey?: (info: {
    key: string;
    locale: string;
    namespace: string;
  }) => TranslationResult | void;
  #onError?: (error: Error, context?: ErrorReportContext) => void;

  constructor(options: I18nOptions<D>) {
    if (!options.locale) {
      throw new Error(ERR_LOCALE_NOT_SET);
    }

    // Initialize core state
    this.#locale = options.locale;
    this.#requestedLocale = options.locale;
    const defaultNs = options.defaultNs ?? DEFAULT_NS;
    const initialNamespaces = options.ns;
    this.#cachedDefaultNs = defaultNs;
    this.translationCache = new TranslationCache({ defaultNs });
    this.#initialNamespaces = initialNamespaces ? [...new Set(initialNamespaces)] : undefined;

    const fallbackLocale = options.fallbackLocale;
    this.#fallbackLocales =
      typeof fallbackLocale === "string" ? [fallbackLocale] : (fallbackLocale ?? []);

    this.#fallbackOnMissingKey = options.onMissingKey;
    this.#onError = options.onError;
    this.#strict = options.strict ?? "off";
    assertInterpolationDefaults(options.defaultParams);
    this.#defaultParams = options.defaultParams ? { ...options.defaultParams } : undefined;
    this.#guaranteedDefaultParamKeys = options.defaultParams
      ? Object.keys(options.defaultParams)
      : [];

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
    this.#tagInterpolation = tagInterpolation;
    if (options.postProcess) {
      this.#postProcessors.push(options.postProcess);
      this.#hasPostProcessors = true;
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
      this.#nsAddTranslations(options.translation);
    }

    // Store API key for plugins to use
    this.apiKey = options.apiKey;

    // Context-collection preference for the in-context editor (default on).
    this.collectContext = options.collectContext;

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
      if (this.#isDestroyed) {
        throw new Error(ERR_INSTANCE_DESTROYED);
      }

      if (this.instanceId && typeof window !== "undefined") {
        const registry = ensureGlobalRegistry();
        if (registry.get(this.instanceId) !== this) {
          registry.register(this.instanceId, this);
        }
      }

      this.#isInitializing = true;
      this.#setLoadingState(true);

      await this.#initializePlugins();

      // Call locale detector if one was registered by plugins
      if (this.#localeDetector) {
        const detectedLocale = await this.#localeDetector();
        if (detectedLocale && detectedLocale !== this.#locale) {
          // Use async method to wait for namespace loading
          await this.setLocaleAsync(detectedLocale);
        }
      }

      const namespacesToLoad = this.#initialNamespaces ?? [this.#cachedDefaultNs];
      if (namespacesToLoad.length > 0) {
        await this.#nsAddActiveNamespaces(namespacesToLoad);
      }

      this.#isInitialized = true;
      this.#emit("initialized");
      return this;
    } catch (error) {
      this.reportError(error as Error, { source: "init" });
      throw error;
    } finally {
      this.#isInitializing = false;
      this.#setLoadingState(false);
    }
  }

  /**
   * Register a plugin (chainable)
   * @param plugin - The plugin to register
   * @param options - Plugin options (required, timeout, onError)
   * @returns this for chaining
   */
  use(plugin: I18nPluginFn, options?: PluginOptions): this {
    this.#plugins.push([
      plugin,
      options?.required ?? true,
      options?.timeout ?? 10000,
      options?.onError,
    ]);
    return this;
  }

  async #initializePlugins(): Promise<void> {
    for (const [plugin, required, timeout, onError] of this.#plugins) {
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
          this.#pluginCleanups.push(result);
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
    let callbacks = this.#eventCallbacks[event];
    if (!callbacks) {
      callbacks = new Set();
      this.#eventCallbacks[event] = callbacks;
    }
    callbacks.add(callback as (data?: unknown) => void);

    return () => {
      const currentCallbacks = this.#eventCallbacks[event];
      if (currentCallbacks) {
        currentCallbacks.delete(callback as (data?: unknown) => void);
        if (currentCallbacks.size === 0) {
          delete this.#eventCallbacks[event];
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers
   * @private
   */
  #emit<E extends I18nEvent>(event: E, data?: I18nEventData[E]): void {
    if (event === "configChanged") {
      this.#configRevision++;
    }
    const callbacks = this.#eventCallbacks[event];
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
    return this.#locale;
  }

  set locale(value: string) {
    // Synchronous setter - fires and forgets namespace loading
    this.setLocaleAsync(value).catch((error) => {
      // Emit error event so apps can handle failures in production
      this.#emit("loadError", {
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
    // The early exit must compare against the LAST REQUESTED locale, not the
    // applied one: reverting to the current locale while another change is in
    // flight has to cancel that change (the bump invalidates its changeId).
    if (this.#locale === value) {
      if (this.#requestedLocale !== value) {
        this.#requestedLocale = value;
        this.#currentLocaleChangeId++;
      }
      return;
    }

    // Track this request to handle race conditions when locale changes rapidly
    this.#requestedLocale = value;
    const changeId = ++this.#currentLocaleChangeId;

    this.#setLoadingState(true);

    try {
      // Load any active namespaces that aren't loaded for the new locale FIRST
      // This ensures we don't switch locale before translations are ready (preventing UI flash)
      if (this.#loader && this.#activeNamespaces.size > 0) {
        await this.#nsLoadNamespacesForLocale(value, [...this.#activeNamespaces], true);
      }

      // Check staleness after EVERY async operation to prevent applying outdated results
      if (changeId !== this.#currentLocaleChangeId) {
        return;
      }

      // Switch locale only after successful load
      const oldLocale = this.#locale;
      this.#locale = value;
      this.#emit("localeChanged", { from: oldLocale, to: value });
    } catch (error) {
      // Re-check staleness: if a newer request superseded this one, suppress the error
      // so only the latest request's outcome is observed by callers
      if (changeId !== this.#currentLocaleChangeId) {
        return;
      }
      throw error;
    } finally {
      // ALWAYS decrement the loading state because we incremented it unconditionally.
      // The reference counter handles overlapping requests seamlessly.
      this.#setLoadingState(false);
    }
  }

  setFallbackLocale(fallback: string | string[]) {
    this.#fallbackLocales = typeof fallback === "string" ? [fallback] : fallback;
    this.#emit("configChanged", { source: "fallbackLocale" });
  }

  setDefaultParams(params: SetDefaultParamsArg<D>): void {
    assertInterpolationDefaults(params);
    assertPreservesDefaultParamKeys(params, this.#guaranteedDefaultParamKeys);
    this.#defaultParams = params ? { ...params } : undefined;
    this.#emit("configChanged", { source: "defaultParams" });
  }

  get defaultParams(): DefaultParamsSnapshot<D> {
    return (
      this.#defaultParams ? { ...this.#defaultParams } : undefined
    ) as DefaultParamsSnapshot<D>;
  }

  get configRevision(): number {
    return this.#configRevision;
  }

  #withDefaultParams(userParams?: TranslationParams): TranslationParams | undefined {
    const defaults = this.#defaultParams;
    if (defaults === undefined) return userParams;
    if (userParams == null) return { ...defaults };
    return { ...defaults, ...userParams };
  }

  /**
   * Clear translations from cache
   * @param locale - Optional locale to clear (if not provided, clears all locales)
   * @param namespace - Optional namespace to clear (if not provided, clears all namespaces)
   */
  clearTranslations(locale?: string, namespace?: string): void {
    // Cancel in-flight loads for the cleared scope so they don't repopulate the cache
    this.#cancelPendingLoads(locale, namespace);

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
      this.#activeNamespaces.delete(namespace);
    } else if (!locale && !namespace) {
      this.#activeNamespaces.clear();
    }

    this.#emit("translationsCleared", { locale, namespace });
  }

  /**
   * Add translations to the cache programmatically
   * @param translations - Object with locale codes as keys, translation objects as values
   */
  addTranslations(translations: Record<string, Record<string, TranslationValue>>) {
    // #nsAddTranslations already emits namespaceLoaded + bumps cache revision; empty input is a no-op.
    this.#nsAddTranslations(translations);
  }

  getTranslations(locale: string = this.#locale, namespace: string = this.#cachedDefaultNs) {
    return this.translationCache.get(locale, namespace) ?? {};
  }

  hasLocale(locale: string, namespace?: string): boolean {
    return this.translationCache.has(locale, namespace ?? this.#cachedDefaultNs);
  }

  hasTranslation(
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks: boolean = false,
  ): boolean {
    const loc = locale ?? this.#locale;
    const ns = namespace ?? this.#cachedDefaultNs;
    const translations =
      loc === this.#locale && ns === this.#cachedDefaultNs
        ? this.#getPrimaryTranslations()
        : this.translationCache.get(loc, ns);
    if (translations !== undefined && translations[key] !== undefined) {
      return true;
    }
    if (checkFallbacks) {
      for (const fallbackLoc of this.#fallbackLocales) {
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
    return this.#loadingCount > 0;
  }

  get isInitializing(): boolean {
    return this.#isInitializing;
  }

  /**
   * Whether Comvi i18n has been initialized (init() has been called successfully)
   */
  get isInitialized(): boolean {
    return this.#isInitialized;
  }

  /**
   * Helper to update loading state and emit event.
   * Uses a reference counter to handle overlapping async operations.
   * #isInitializing is owned by init() exclusively — nested loads (e.g. a
   * locale detector triggering setLocaleAsync mid-init) must not clear it.
   */
  #setLoadingState(isLoading: boolean): void {
    const wasLoading = this.#loadingCount > 0;
    if (isLoading) {
      this.#loadingCount++;
    } else {
      this.#loadingCount = Math.max(0, this.#loadingCount - 1);
    }

    const effectiveIsLoading = this.#loadingCount > 0;

    if (wasLoading !== effectiveIsLoading) {
      this.#emit("loadingStateChanged", {
        isLoading: effectiveIsLoading,
        isInitializing: this.#isInitializing,
      });
    }
  }

  setDefaultNamespace(namespace: string) {
    const previousNamespace = this.#cachedDefaultNs;
    if (previousNamespace === namespace) {
      return;
    }

    this.#cachedDefaultNs = namespace;
    this.#emit("defaultNamespaceChanged", { from: previousNamespace, to: namespace });
  }

  getDefaultNamespace(): string {
    return this.#cachedDefaultNs;
  }

  getActiveNamespaces(): string[] {
    return [...this.#activeNamespaces];
  }

  /** The resolved fallback-locale chain (read-only snapshot). */
  getFallbackLocales(): string[] {
    return [...this.#fallbackLocales];
  }

  /**
   * Store plugin-specific data on the i18n instance.
   * This allows plugins to store configuration that persists with the instance.
   */
  setPluginData(key: string, data: unknown): void {
    this.#pluginData[key] = data;
  }

  /**
   * Retrieve plugin-specific data from the i18n instance.
   */
  getPluginData<T = unknown>(key: string): T | undefined {
    return this.#pluginData[key] as T | undefined;
  }

  async addActiveNamespace(namespace: string): Promise<void> {
    return this.addActiveNamespaces([namespace]);
  }

  async addActiveNamespaces(namespaces: string[]): Promise<void> {
    this.#setLoadingState(true);
    try {
      await this.#nsAddActiveNamespaces(namespaces);
    } finally {
      this.#setLoadingState(false);
    }
    this.#emit("configChanged", { source: "namespaceActivated" });
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
    return this.#nsReloadTranslations(locale, namespace);
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
    this.#postProcessors.push(fn);
    this.#hasPostProcessors = true;
  }

  /**
   * Translate a namespaced key (when ns is provided)
   */
  tRaw<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    translationKey: K | null,
    ...params: NamespacedParamsArg<NS, K, D>
  ): TranslationResult;

  /**
   * Translate a key with typed params
   */
  tRaw<K extends keyof TranslationKeys>(
    translationKey: K | null,
    ...params: ParamsArg<K, D>
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
    if (userParams == null && !this.#hasPostProcessors) {
      const translations = this.#getPrimaryTranslations();
      if (translations !== undefined) {
        const template = translations[key];
        if (template !== undefined && isStaticTemplate(template) === true) {
          return template;
        }
      }
    }

    return this.#translate(
      key,
      this.#locale,
      this.#cachedDefaultNs,
      this.#fallbackLocales,
      this.#withDefaultParams(userParams),
    );
  }

  /**
   * Translate a namespaced key (when ns is provided)
   */
  t<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    translationKey: K | null,
    ...params: NamespacedParamsArg<NS, K, D>
  ): string;

  /**
   * Translate a key with typed params
   */
  t<K extends keyof TranslationKeys>(translationKey: K | null, ...params: ParamsArg<K, D>): string;

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

  #getPrimaryTranslations(): FlattenedTranslations | undefined {
    const revision = this.translationCache.getRevision();
    if (
      this.#primaryTranslationsRevision === revision &&
      this.#primaryTranslationsLocale === this.#locale &&
      this.#primaryTranslationsNamespace === this.#cachedDefaultNs
    ) {
      return this.#primaryTranslations;
    }

    const translations = this.translationCache.get(this.#locale, this.#cachedDefaultNs);
    this.#primaryTranslations = translations;
    this.#primaryTranslationsRevision = revision;
    this.#primaryTranslationsLocale = this.#locale;
    this.#primaryTranslationsNamespace = this.#cachedDefaultNs;
    return translations;
  }

  #translate(
    translationKey: string,
    currentLocale: string,
    defaultNamespace: string,
    fallbackLocales: string[],
    params?: TranslationParams,
  ): TranslationResult {
    const hasParams = params != null;
    const locale = hasParams && params.locale !== undefined ? params.locale : currentLocale;
    const namespace = hasParams && params.ns !== undefined ? params.ns : defaultNamespace;
    const skipPostProcess = !this.#hasPostProcessors;

    const translations =
      locale === this.#locale && namespace === this.#cachedDefaultNs
        ? this.#getPrimaryTranslations()
        : this.translationCache.get(locale, namespace);
    const template = translations?.[translationKey];
    if (template !== undefined) {
      const result = translate(template, locale, params, this.#tagInterpolation);
      return skipPostProcess
        ? result
        : this.#postProcess(result, translationKey, namespace, params);
    }

    for (const fallbackLoc of fallbackLocales) {
      const fallbackTranslations = this.translationCache.get(fallbackLoc, namespace);
      const fallbackTemplate = fallbackTranslations?.[translationKey];
      if (fallbackTemplate !== undefined) {
        const result = translate(fallbackTemplate, fallbackLoc, params, this.#tagInterpolation);
        return skipPostProcess
          ? result
          : this.#postProcess(result, translationKey, namespace, params);
      }
    }

    const missingResult = this.#handleMissingTranslation(translationKey, locale, namespace, params);
    return skipPostProcess
      ? missingResult
      : this.#postProcess(missingResult, translationKey, namespace, params);
  }

  #postProcess(
    result: TranslationResult,
    key: string,
    namespace: string,
    params?: TranslationParams,
  ): TranslationResult {
    const safeParams = params ?? {};
    let acc = result;
    for (let i = 0; i < this.#postProcessors.length; i++) {
      try {
        acc = this.#postProcessors[i](acc, key, namespace, safeParams);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.reportError(err, { source: "post-processor", key, namespace });
      }
    }
    return acc;
  }

  #handleMissingTranslation(
    key: string,
    locale: string,
    namespace: string,
    params?: TranslationParams,
  ): TranslationResult {
    if (this.#strict === "dev") {
      warn(IS_DEV ? `[i18n] Translation not found: "${key}"` : "E_TRANSLATION_NOT_FOUND", {
        key,
        locale,
        namespace,
      });
    }

    this.#emit("missingKey", { key, locale, namespace });

    let fallbackValue: TranslationResult | undefined;
    // Callbacks always run (plugins track missing keys via side effects)
    for (const callback of this.#missingKeyCallbacks) {
      const result = callback(key, locale, namespace);
      if (fallbackValue === undefined && result !== undefined) {
        fallbackValue = result;
      }
    }

    // Per-call fallback has the highest priority — skip the instance-level handler
    if (params?.fallback !== undefined) {
      return translateTemplate(params.fallback, params, locale, this.#tagInterpolation);
    }

    if (fallbackValue === undefined) {
      const r = this.#fallbackOnMissingKey?.({ key, locale, namespace });
      if (r !== undefined) fallbackValue = r;
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
    this.#localeDetector = detector;
  }

  /**
   * Get the registered locale detector function
   */
  public getLanguageDetector(): (() => string | Promise<string>) | undefined {
    return this.#localeDetector;
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
   *   'en': () => import('./locales/en.json'),
   *   'en:dashboard': () => import('./locales/dashboard/en.json'),
   *   'fr': () => import('./locales/fr.json'),
   * });
   * ```
   *
   * Keys without `:` are expanded to `"locale:defaultNs"`.
   * The `{ default: ... }` wrapper from dynamic `import()` is unwrapped automatically.
   */
  public registerLoader(loader: LoaderFn | LoaderImportMap): void {
    if (typeof loader === "function") {
      this.#loader = loader;
      return;
    }

    if (typeof loader !== "object" || loader === null) {
      throw new Error(ERR_REGISTER_LOADER_ARG);
    }

    this.#loader = createImportMapLoader(loader, () => this.#cachedDefaultNs);
  }

  /**
   * Get the registered loader function
   */
  public getLoader(): LoaderFn | undefined {
    return this.#loader;
  }

  /**
   * Register a callback for missing translation keys
   * @param callback - Function called when a key is missing. Can return a string to use as fallback.
   * @returns Cleanup function to remove the callback
   */
  public onMissingKey(
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ): () => void {
    this.#missingKeyCallbacks.add(callback);
    return () => void this.#missingKeyCallbacks.delete(callback);
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

    if (this.#onError) {
      try {
        this.#onError(err, context);
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

  #nsLoadNamespace(locale: string, namespace: string): Promise<void> {
    const key = `${locale}:${namespace}`;
    const existing = this.#pendingLoads[key];
    if (existing) {
      return existing;
    }

    const generation = this.#nsGeneration;
    const loader = this.#loader!;

    // A load is cancelled when its #pendingLoads entry is removed (clear/reload)
    // or the generation is bumped (destroy). Cancelled loads must neither write
    // to the cache nor surface their errors. The closure only reads `guarded`
    // after the first await, when the assignment below has already run.
    let guarded!: Promise<void>;
    // eslint-disable-next-line prefer-const -- self-reference needs declare-then-assign
    guarded = (async () => {
      try {
        const translations = await loader(locale, namespace);
        if (generation !== this.#nsGeneration || this.#pendingLoads[key] !== guarded) return;
        this.translationCache.set(locale, namespace, normalizeTranslationObject(translations));
        this.#emit("namespaceLoaded", { namespace, locale });
      } catch (error) {
        if (generation !== this.#nsGeneration || this.#pendingLoads[key] !== guarded) return;
        this.#emit("loadError", { locale, namespace, error: error as Error });
        throw error;
      } finally {
        if (this.#pendingLoads[key] === guarded) {
          delete this.#pendingLoads[key];
        }
      }
    })();

    this.#pendingLoads[key] = guarded;
    return guarded;
  }

  /** Cancel pending namespace loads matching the given scope (undefined = any). */
  #cancelPendingLoads(locale?: string, namespace?: string): void {
    for (const key in this.#pendingLoads) {
      const colonIdx = key.indexOf(":");
      const loc = key.slice(0, colonIdx);
      const ns = key.slice(colonIdx + 1);
      if (
        (locale === undefined || loc === locale) &&
        (namespace === undefined || ns === namespace)
      ) {
        delete this.#pendingLoads[key];
      }
    }
  }

  async #nsLoadNamespacesForLocale(
    locale: string,
    namespaces: string[],
    skipLoaded: boolean = true,
  ): Promise<void> {
    if (!this.#loader) return;

    const namespacesToLoad = skipLoaded
      ? namespaces.filter((ns) => !this.translationCache.has(locale, ns))
      : namespaces;

    if (namespacesToLoad.length === 0) return;

    const failedNamespacesList: string[] = [];
    await Promise.all(
      namespacesToLoad.map((ns) =>
        this.#nsLoadNamespace(locale, ns).catch(() => {
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

  async #nsAddActiveNamespaces(namespaces: string[]): Promise<void> {
    // Add to active set optimistically. If the load fails, the namespace
    // stays active so it will be retried automatically on the next locale
    // switch — this matches caller expectations and avoids forcing manual retry.
    for (const ns of namespaces) this.#activeNamespaces.add(ns);
    await this.#nsLoadNamespacesForLocale(this.#locale, namespaces, true);
  }

  async #nsReloadTranslations(locale?: string, namespace?: string): Promise<void> {
    if (!this.#loader) {
      throw new Error(ERR_NO_LOADER_REGISTERED);
    }

    const localesToReload = locale ? [locale] : [this.#locale, ...this.#fallbackLocales];
    const namespacesToReload = namespace ? [namespace] : [...this.#activeNamespaces];

    for (const loc of localesToReload) {
      for (const ns of namespacesToReload) {
        // Cancel any in-flight load so reload fetches fresh data instead of
        // resolving to a request that started before the cache was cleared
        this.#cancelPendingLoads(loc, ns);
        this.translationCache.delete(loc, ns);
      }
    }

    const failures: Array<{ loc: string; reason: unknown }> = [];
    await Promise.all(
      localesToReload.map((loc) =>
        this.#nsLoadNamespacesForLocale(loc, namespacesToReload, false).catch((reason) => {
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

  #nsAddTranslations(translations: Record<string, Record<string, TranslationValue>>): void {
    for (const localeOrKey in translations) {
      const value = translations[localeOrKey];
      const flattenedTranslations = normalizeTranslationObject(value);

      const colonIdx = localeOrKey.indexOf(":");
      const loc = colonIdx === -1 ? localeOrKey : localeOrKey.slice(0, colonIdx);
      const ns = colonIdx === -1 ? this.#cachedDefaultNs : localeOrKey.slice(colonIdx + 1);

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

      this.#activeNamespaces.add(ns);
      this.#emit("namespaceLoaded", { namespace: ns, locale: loc });
    }
  }

  /**
   * Destroy Comvi i18n and clean up all resources
   */
  public async destroy(): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;

    // Unregister from global __COMVI__
    if (this.instanceId && typeof window !== "undefined") {
      window.__COMVI__?.unregister(this.instanceId);
    }

    while (this.#pluginCleanups.length > 0) {
      try {
        await this.#pluginCleanups.pop()!();
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "plugin-cleanup",
        });
      }
    }
    // Reset lifecycle flags before tearing down event subscriptions so wrappers can react.
    const hadLoadingState = this.#loadingCount > 0 || this.#isInitializing;
    this.#loadingCount = 0;
    this.#isInitializing = false;
    this.#isInitialized = false;

    if (hadLoadingState) {
      this.#emit("loadingStateChanged", { isLoading: false, isInitializing: false });
    }
    this.#emit("destroyed");

    this.#eventCallbacks = {};
    this.#missingKeyCallbacks.clear();

    this.#nsGeneration++;
    this.#activeNamespaces.clear();
    this.#pendingLoads = {};
    this.#loader = undefined;
    this.#postProcessors = [];
    this.#hasPostProcessors = false;

    // Clear cache and other state
    this.translationCache.clear();
    this.#localeDetector = undefined;
    this.#pluginData = Object.create(null);
  }
}

/**
 * Create an i18n instance
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18n<D> {
  return new I18n(options);
}
