import type {
  I18nOptions,
  I18nCoreInstance,
  I18nCoreExtraApi,
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
  ComviQueueEntry,
  LoaderFn,
  LoaderResult,
} from "../types";
import { DEFAULT_NS, COMVI_REPORTED } from "../constants";
import { warn } from "../logger";
import {
  assertInterpolationDefaults,
  assertPreservesDefaultParamKeys,
} from "../utils/defaultParams";
import { translationResultToString } from "../utils/translationResultToString";
import { TranslationCache } from "./TranslationCache";
import { isStaticTemplate, translate, translateTemplate } from "./translate";
import {
  effectiveExtBits,
  getCompilerId,
  mergeTagInterpolation,
  type MessageCompiler,
  type MissingParamMode,
} from "./translate/syntax";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const ERR_LOCALE_NOT_SET = IS_DEV ? "@comvi/core: Locale is not set" : "E_LOCALE_NOT_SET";
const ERR_TRANSLATION_NOT_OBJECT = IS_DEV
  ? "@comvi/core: Translation is not an object"
  : "E_TRANSLATION_NOT_OBJECT";
const ERR_INSTANCE_DESTROYED = IS_DEV
  ? "[i18n] Cannot call init() after destroy(). Create a new i18n instance."
  : "E_INSTANCE_DESTROYED";

/**
 * DEV-ONLY diagnostic for the `_flattenNs` seam: a bare host stores catalogs
 * verbatim, so a nested object or a non-string leaf silently becomes an
 * un-renderable template. Behind `IS_DEV`, so it costs the production bundle
 * nothing — which is the entire point of putting the flattener behind a seam.
 */
function warnIfNotFlat(localeOrKey: string, catalog: Record<string, unknown>): void {
  for (const key in catalog) {
    if (typeof catalog[key] === "string") continue;
    warn(
      `[i18n] addTranslations("${localeOrKey}"): "${key}" is not a string. This host stores ` +
        `catalogs as given — pass a FLAT catalog, wrap a nested one with ` +
        `flattenCatalog() from "@comvi/core/loader", or attach the loader capability.`,
    );
    return;
  }
}

/**
 * Loader types live in `types.ts` (they are part of `I18nLoaderApi`); this
 * type-only re-export keeps `full.ts` / `importMapLoader.ts` importing them
 * from the class module. Zero emitted bytes.
 */
export type { LoaderFn, LoaderResult };

/**
 * @internal
 * The cross-module state + hook contract. Capability modules
 * (`core/loader.ts`, `core/plugins.ts`) see instances ONLY through this type
 * — never through the class, whose `_`-members are TS-private.
 *
 * MANGLING CONTRACT (plan R2): every `_`-prefixed member below is renamed by
 * the single shared terser nameCache in `vite.shared.ts#mangleInternalProps`.
 * That only stays consistent across chunks because every core subpath entry
 * is built by ONE vite invocation (`coreEntries`). Access these members by
 * DOT only — never `i["_loader"]`, never `"_loadNs" in i`, never
 * `Object.keys`-driven logic over them.
 */
export interface I18nInternal<D extends DefaultTranslationParams = {}> extends I18nCoreInstance<D> {
  // ── base state capability modules read/write ──
  _locale: string;
  _fallbackLocales: string[];
  _cachedDefaultNs: string;
  _activeNamespaces: Set<string>;
  _emit<E extends I18nEvent>(event: E, data?: I18nEventData[E]): void;
  _setLoadingState(isLoading: boolean): void;

  // ── two-phase destroy ──
  // Named seams rather than a registry: the base already declares one seam
  // per capability hook, and a single optional call is markedly cheaper than
  // an array field + push + loop (measured on the full entry).
  /** Awaited before any lifecycle reset or emit — capability state still live. */
  _preDestroy?: () => void | Promise<void>;
  /** Discovery removal, run FIRST — before any lifecycle reset (see `destroy`). */
  _disposeDevtools?: () => void;
  /** Capability resets, run after the `destroyed` emit. */
  _resetLoader?: () => void;
  _resetPlugins?: () => void;
  /** Capability state initializers, installed with the capability's methods. */
  _initLoader?: () => void;
  _initPlugins?: () => void;
  _initDevtools?: (instanceId?: string, exposeGlobal?: boolean) => void;

  // ── capability hooks (installed by attach* / the full subclass) ──
  _loadNs?: (locale: string, namespaces: string[], skipLoaded: boolean) => Promise<void>;
  _cancelNs?: (locale?: string, namespace?: string) => void;
  _beforeInit?: () => Promise<void>;
  _missHook?: (key: string, locale: string, namespace: string) => TranslationResult | undefined;
  /**
   * Nested-catalog flattening for `addTranslations` / `options.translation`.
   * A PROTOTYPE method on `I18nWithLoader`, never an instance field, so the
   * root entry has it during `super()` — `options.translation` is merged
   * inside the base constructor, before any `_init*` runs.
   */
  _flattenNs?: (catalog: Record<string, TranslationValue>) => FlattenedTranslations;

  // ── devtools discovery capability (`core/devtools.ts`) ──
  // `instanceId` is PUBLIC (`I18nCoreExtraApi`) but writable only here: the
  // base declares it and never assigns it, so it is an own property exactly
  // when the discovery capability exposed the instance.
  instanceId: string | undefined;
  _globalEntry?: ComviQueueEntry;

  // ── loader capability state (initLoaderState) ──
  // `_currentLocaleChangeId`/`_requestedLocale` arbitrate rapid locale
  // switches; they live here rather than on the base because only the
  // `/loader` `setLocaleAsync` override can have a load in flight.
  _loader?: LoaderFn;
  _pendingLoads: Record<string, Promise<void> | undefined>;
  _nsGeneration: number;
  _currentLocaleChangeId: number;
  _requestedLocale: string;
}

/**
 * I18n is the main entry point for the i18n system.
 * It acts as a Facade coordinating three specialized managers:
 * - NamespaceManager: Handles namespace loading and tracking
 * - Internal plugin lifecycle runtime: Handles plugin init/cleanup and error recovery
 */
export class I18n<D extends DefaultTranslationParams = {}>
  implements I18nCoreInstance<D>, I18nCoreExtraApi
{
  // Core state
  /** `protected`, not `private`: the capability subclasses in `core/loader.ts` / `core/plugins.ts` read it. */
  protected _locale: string;
  public readonly translationCache: TranslationCache;
  private _isInitializing: boolean = false;
  private _isInitialized: boolean = false;
  private _isDestroyed: boolean = false;
  private _loadingCount: number = 0;
  protected _fallbackLocales: string[];
  public readonly apiKey: string | undefined;
  public readonly collectContext: boolean | undefined;
  public readonly devMode: boolean;
  /**
   * Assigned ONLY by the discovery capability (`core/devtools.ts`), which the
   * root entry composes in and `attachDevtools` installs on a slim instance.
   * `declare`: the base must not emit an initializer for it, so on an
   * instance that was never exposed it is not an own property at all.
   */
  declare public readonly instanceId: string | undefined;
  private _cachedDefaultNs: string;
  private _initialNamespaces?: string[];
  private _strict: "dev" | "off";
  private _defaultParams?: DefaultTranslationParams;
  private _guaranteedDefaultParamKeys: readonly string[];
  private _configRevision = 0;
  private _tagInterpolation?: TagInterpolationOptions;
  private _missingParam: MissingParamMode;
  private readonly _compiler: MessageCompiler;
  private readonly _compilerId: number;
  /** `protected`: `registerPostProcessor` lives in the plugin capability. */
  protected _postProcessors: PostProcessFn[] = [];
  private _primaryTranslations?: FlattenedTranslations;
  private _primaryTranslationsRevision: number = -1;
  private _primaryTranslationsLocale: string = "";
  private _primaryTranslationsNamespace: string = "";

  // Namespace state (inlined from NamespaceManager)
  protected _activeNamespaces = new Set<string>();

  // Capability seams (`_loadNs`, `_cancelNs`, `_loader`) are NOT declared
  // here: the root subclass declares them as real methods (`core/loader.ts`,
  // `core/plugins.ts`) and `attach*` copies those descriptors onto a slim
  // instance. The base only ever READS them, through the `I18nInternal`
  // cross-module contract — a type-only cast that emits nothing.

  // Event system for framework wrappers and plugins
  private _eventCallbacks: Partial<Record<I18nEvent, Set<(data?: unknown) => void>>> =
    Object.create(null);

  // Options storage
  private _fallbackOnMissingKey?: (info: {
    key: string;
    locale: string;
    namespace: string;
  }) => TranslationResult | void;
  private _onError?: (error: Error, context?: ErrorReportContext) => void;

  /**
   * @param compiler Message compiler injected by the entry-point factory
   * (root → ICU, slim → simple, or user-injected). Its identity is part of
   * every template cache key this instance produces.
   */
  constructor(options: I18nOptions<D>, compiler: MessageCompiler) {
    if (!options.locale) {
      throw new Error(ERR_LOCALE_NOT_SET);
    }
    this._compiler = compiler;
    this._compilerId = getCompilerId(compiler);
    this._missingParam = options.missingParam ?? "literal";

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
    assertInterpolationDefaults(options.defaultParams);
    this._defaultParams = options.defaultParams ? { ...options.defaultParams } : undefined;
    this._guaranteedDefaultParamKeys = options.defaultParams
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
    this._tagInterpolation = tagInterpolation;
    if (options.postProcess) {
      this._postProcessors.push(options.postProcess);
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

    // Context-collection preference for the in-context editor (default on).
    this.collectContext = options.collectContext;

    // Development mode: the build-time __DEV__ flag unless the caller overrides it.
    this.devMode = options.devMode ?? IS_DEV;

    // Discovery (`window.__COMVI__`) is NOT here: it is the `core/devtools.ts`
    // capability, composed in by the root entry's constructor and installed
    // on a slim instance by `attachDevtools`. `options.exposeGlobal` /
    // `options.instanceId` are read there, not by the base.
  }

  /**
   * Apply a capability installer and return whatever it produces — the
   * composition pipe.
   *
   * ```ts
   * import { createI18n } from "@comvi/core/slim";
   * import { loader } from "@comvi/core/loader";
   *
   * const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
   * ```
   *
   * It is a pipe and NOTHING more: `with(f)` is `f(this)`. No registry, no
   * ordering, no capability semantics — which is why it can sit on the base
   * class for ~10 B and never lie about what an instance has. The installer's
   * own return type decides the result: `loader()` from `@comvi/core/loader`
   * widens the host with the loader API, `(i) => i` widens nothing.
   *
   * `attachLoader` / `attachPlugins` / `attachDevtools` are themselves valid
   * installers (`i18n.with(attachLoader)` works); the `loader()` /
   * `plugins()` / `devtools()` factories exist to CONFIGURE the capability in
   * the same call. The parameter is deliberately the widest honest shape —
   * any `(host) => value` — so a future branded installer (a plugin package
   * exporting itself as `.with`-able) fits without a signature change.
   */
  public with<T>(installer: (i18n: this) => T): T {
    return installer(this);
  }

  /**
   * Initialize Comvi i18n - executes plugins and loads translations
   */
  public async init(): Promise<this> {
    try {
      if (this._isDestroyed) {
        throw new Error(ERR_INSTANCE_DESTROYED);
      }

      this._isInitializing = true;
      this._setLoadingState(true);

      // Plugin capability: run the registered plugins, then a
      // plugin-registered locale detector. Order preserved exactly.
      await (this as unknown as I18nInternal)._beforeInit?.();

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
      this._isInitializing = false;
      this._setLoadingState(false);
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
  protected _emit<E extends I18nEvent>(event: E, data?: I18nEventData[E]): void {
    if (event === "configChanged") {
      this._configRevision++;
    }
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
   * Set the locale and emit `localeChanged`.
   *
   * The base transition is synchronous by construction: a bare instance has
   * no loader, so there is nothing to await, no stale result to suppress and
   * no loading refcount to move. `@comvi/core/loader` OVERRIDES this method
   * with the guarded version (changeId staleness + mid-flight cancellation +
   * `_setLoadingState` refcount around the namespace load); the root entry
   * inherits that override through `extends`, a slim instance receives it
   * from `attachLoader`. Both paths keep this `Promise`-returning signature.
   *
   * @param value - The locale code to set
   * @returns Promise that resolves when the locale has been applied
   */
  async setLocaleAsync(value: string): Promise<void> {
    if (this._locale === value) return;

    const oldLocale = this._locale;
    this._locale = value;
    this._emit("localeChanged", { from: oldLocale, to: value });
  }

  setFallbackLocale(fallback: string | string[]) {
    this._fallbackLocales = typeof fallback === "string" ? [fallback] : fallback;
    this._emit("configChanged", { source: "fallbackLocale" });
  }

  setDefaultParams(params: SetDefaultParamsArg<D>): void {
    assertInterpolationDefaults(params);
    assertPreservesDefaultParamKeys(params, this._guaranteedDefaultParamKeys);
    this._defaultParams = params ? { ...params } : undefined;
    this._emit("configChanged", { source: "defaultParams" });
  }

  get defaultParams(): DefaultParamsSnapshot<D> {
    return (
      this._defaultParams ? { ...this._defaultParams } : undefined
    ) as DefaultParamsSnapshot<D>;
  }

  get configRevision(): number {
    return this._configRevision;
  }

  private _withDefaultParams(userParams?: TranslationParams): TranslationParams | undefined {
    const defaults = this._defaultParams;
    if (defaults === undefined) return userParams;
    return { ...defaults, ...userParams };
  }

  /**
   * Clear translations from cache
   * @param locale - Optional locale to clear (if not provided, clears all locales)
   * @param namespace - Optional namespace to clear (if not provided, clears all namespaces)
   */
  clearTranslations(locale?: string, namespace?: string): void {
    // Cancel in-flight loads for the cleared scope so they don't repopulate the cache
    (this as unknown as I18nInternal)._cancelNs?.(locale, namespace);

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

    this._emit("translationsCleared", { locale, namespace });
  }

  /**
   * Add translations to the cache programmatically
   * @param translations - Object with locale codes as keys, translation objects as values
   */
  addTranslations(translations: Record<string, Record<string, TranslationValue>>) {
    // _nsAddTranslations already emits namespaceLoaded + bumps cache revision; empty input is a no-op.
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
   * _isInitializing is owned by init() exclusively — nested loads (e.g. a
   * locale detector triggering setLocaleAsync mid-init) must not clear it.
   */
  protected _setLoadingState(isLoading: boolean): void {
    const wasLoading = this._loadingCount > 0;
    if (isLoading) {
      this._loadingCount++;
    } else {
      this._loadingCount = Math.max(0, this._loadingCount - 1);
    }

    const effectiveIsLoading = this._loadingCount > 0;

    if (wasLoading !== effectiveIsLoading) {
      this._emit("loadingStateChanged", {
        isLoading: effectiveIsLoading,
        isInitializing: this._isInitializing,
      });
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

  /** The resolved fallback-locale chain (read-only snapshot). */
  getFallbackLocales(): string[] {
    return [...this._fallbackLocales];
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
    if (userParams == null && !this._postProcessors.length) {
      const translations = this._getPrimaryTranslations();
      if (translations !== undefined) {
        const template = translations[key];
        if (
          template !== undefined &&
          isStaticTemplate(
            template,
            false,
            this._compilerId,
            effectiveExtBits(this._tagInterpolation?.extensions),
          ) === true
        ) {
          return template;
        }
      }
    }

    return this._translate(
      key,
      this._locale,
      this._cachedDefaultNs,
      this._fallbackLocales,
      this._withDefaultParams(userParams),
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
    const skipPostProcess = !this._postProcessors.length;
    // Per-call channel (§1.1 dual-channel): params.tagInterpolation merges
    // over the instance option for this call only (no-op without params).
    const tagInterpolation = mergeTagInterpolation(
      this._tagInterpolation,
      params?.tagInterpolation,
    );

    const translations =
      locale === this._locale && namespace === this._cachedDefaultNs
        ? this._getPrimaryTranslations()
        : this.translationCache.get(locale, namespace);
    const template = translations?.[translationKey];
    if (template !== undefined) {
      const result = translate(
        template,
        locale,
        params,
        tagInterpolation,
        this._compiler,
        this._missingParam,
      );
      return skipPostProcess
        ? result
        : this._postProcess(result, translationKey, namespace, params);
    }

    for (const fallbackLoc of fallbackLocales) {
      const fallbackTranslations = this.translationCache.get(fallbackLoc, namespace);
      const fallbackTemplate = fallbackTranslations?.[translationKey];
      if (fallbackTemplate !== undefined) {
        const result = translate(
          fallbackTemplate,
          fallbackLoc,
          params,
          tagInterpolation,
          this._compiler,
          this._missingParam,
        );
        return skipPostProcess
          ? result
          : this._postProcess(result, translationKey, namespace, params);
      }
    }

    const missingResult = this._handleMissingTranslation(
      translationKey,
      locale,
      namespace,
      params,
      tagInterpolation,
    );
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
    tagInterpolation?: TagInterpolationOptions,
  ): TranslationResult {
    if (this._strict === "dev") {
      warn(IS_DEV ? `[i18n] Translation not found: "${key}"` : "E_TRANSLATION_NOT_FOUND", {
        key,
        locale,
        namespace,
      });
    }

    this._emit("missingKey", { key, locale, namespace });

    // The plugin capability's missing-key callbacks always run (plugins track
    // missing keys through side effects); the first defined result wins.
    let fallbackValue = (this as unknown as I18nInternal)._missHook?.(key, locale, namespace);

    // Per-call fallback has the highest priority — skip the instance-level handler
    if (params?.fallback !== undefined) {
      return translateTemplate(
        params.fallback,
        params,
        locale,
        tagInterpolation,
        this._compiler,
        this._missingParam,
      );
    }

    if (fallbackValue === undefined) {
      const r = this._fallbackOnMissingKey?.({ key, locale, namespace });
      if (r !== undefined) fallbackValue = r;
    }

    return fallbackValue !== undefined ? fallbackValue : key;
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

  protected async _nsAddActiveNamespaces(namespaces: string[]): Promise<void> {
    // Add to active set optimistically. If the load fails, the namespace
    // stays active so it will be retried automatically on the next locale
    // switch — this matches caller expectations and avoids forcing manual retry.
    for (const ns of namespaces) this._activeNamespaces.add(ns);
    await (this as unknown as I18nInternal)._loadNs?.(this._locale, namespaces, true);
  }

  /**
   * Merge a `{ locale | "locale:ns": catalog }` map into the cache.
   *
   * The base accepts FLAT catalogs — `{ "a.b": "…" }` — and copies them onto
   * a prototype-less object, which is its prototype-pollution guard. NESTED
   * catalogs and non-string leaves are the
   * `_flattenNs` capability's job (`core/loader.ts`, installed on the root
   * class and by `attachLoader` / `attachNestedCatalogs`): a nested object is
   * data the loader path produces, and a bare slim host that never loads
   * anything should not carry a recursive flattener for it.
   */
  private _nsAddTranslations(translations: Record<string, Record<string, TranslationValue>>): void {
    for (const localeOrKey in translations) {
      const value = translations[localeOrKey];
      // A bare host has no `_flattenNs`, so it stores the caller's catalog as
      // given — the copy onto a prototype-less target IS its
      // prototype-pollution guard, and it happens here, once, where the raw
      // object enters. The flattener already returns a fresh prototype-less
      // object, so a host that has one never pays a second copy.
      const flat =
        (this as unknown as I18nInternal)._flattenNs?.(value) ??
        Object.assign(Object.create(null), value);

      if (IS_DEV) warnIfNotFlat(localeOrKey, flat);

      const colonIdx = localeOrKey.indexOf(":");
      const loc = colonIdx === -1 ? localeOrKey : localeOrKey.slice(0, colonIdx);
      const ns = colonIdx === -1 ? this._cachedDefaultNs : localeOrKey.slice(colonIdx + 1);

      // Only a genuine MERGE copies again. `flat` is already fresh and
      // prototype-less either way, so the first write stores it directly:
      // `Object.assign` out of a dictionary-mode (null-prototype) source has
      // no fast path in V8 and costs ~130 ns PER KEY, so copying the whole
      // catalog a second time made a root `new I18n({ translation })` 2.5x
      // slower than 6fa713b (.omc/handoffs/ctor-perf.md).
      const existing = this.translationCache.get(loc, ns);
      this.translationCache.set(
        loc,
        ns,
        existing ? Object.assign(Object.create(null), existing, flat) : flat,
      );

      this._activeNamespaces.add(ns);
      this._emit("namespaceLoaded", { namespace: ns, locale: loc });
    }
  }

  /**
   * Destroy Comvi i18n and clean up all resources
   */
  public async destroy(): Promise<void> {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;

    // Phase 0 — discovery removal, at the exact position the inline
    // `window.__COMVI__` block occupied (`core/devtools.ts`).
    (this as unknown as I18nInternal)._disposeDevtools?.();

    // Phase 1 — awaited pre-lifecycle cleanup, while capability state is live.
    await (this as unknown as I18nInternal)._preDestroy?.();

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
    this._activeNamespaces.clear();
    this._postProcessors = [];

    // Clear cache and other state
    this.translationCache.clear();

    // Phase 3 — capability reset, after the `destroyed` listeners have seen
    // the still-live capability state.
    const self = this as unknown as I18nInternal;
    self._resetLoader?.();
    self._resetPlugins?.();
  }
}
