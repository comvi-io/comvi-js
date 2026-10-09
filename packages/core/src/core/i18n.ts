import type {
  I18nOptions,
  I18nCoreInstance,
  I18nCoreExtraApi,
  I18nMessagesView,
  FlattenedMessages,
  MessagesMap,
  TranslationResult,
  TranslationParams,
  PostProcessFn,
  I18nEvent,
  I18nEventData,
  AcceptedCoreKey,
  NamespacedKeys,
  Namespaces,
  ArgsFor,
  ErrorReportContext,
  TagInterpolationOptions,
  DefaultTranslationParams,
  SetDefaultParamsArg,
  DefaultParamsSnapshot,
  ComviQueueEntry,
  LoaderFn,
  LoaderResult,
} from "../types";
import { DEFAULT_NS } from "../constants";
import { warn } from "../logger";
import {
  assertInterpolationDefaults,
  assertPreservesDefaultParamKeys,
} from "../utils/defaultParams";
import { translationResultToString } from "../utils/translationResultToString";
import { normalizeTranslationObject } from "../utils";
import { claimCoreInstance } from "./duplicateGuard";
import { MessagesCache } from "./MessagesCache";
import { isStaticTemplate, translate, translateTemplate } from "./translate";
import {
  clearIcuHit,
  icuHit,
  simpleCompiler,
  type IcuSyntaxError,
} from "./translate/compile-simple";
import { parseTemplate } from "./translate/parser";
import { TK_PLURAL, TK_SELECT, TK_TAG, type ParsedToken } from "./translate/cache";
import {
  effectiveExtBits,
  effectiveExtensions,
  getCompilerId,
  mergeTagInterpolation,
  type MessageCompiler,
  type MissingParamMode,
} from "./translate/syntax";

declare const __DEV__: boolean | undefined;
declare const __VERSION__: string | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const ERR_LOCALE_NOT_SET = IS_DEV ? "[@comvi/core] Locale is not set" : "E_LOCALE_NOT_SET";
const ERR_MESSAGES_NOT_OBJECT = IS_DEV
  ? "[@comvi/core] `messages` is not an object"
  : "E_MESSAGES_NOT_OBJECT";
const ERR_INSTANCE_DESTROYED = IS_DEV
  ? "[@comvi/core] Cannot call init() after destroy(). Create a new i18n instance."
  : "E_INSTANCE_DESTROYED";
/**
 * See {@link I18n.use}: the rule is identity, and this is the whole diagnostic.
 *
 * It NAMES what came back — `typeof`, plus whether an object is thenable —
 * because that is the detail separating "you passed an async plugin" from "you
 * passed nothing", and the two have different fixes. DEV-only by construction:
 * the builder is reachable only from an `IS_DEV ?` arm, so production folds to
 * the bare code and then drops this function entirely.
 */
const useNotInstallerMessage = (widened: unknown): string =>
  `[@comvi/core] .use(f) expects an installer that returns the i18n instance it was given, but f returned ${
    widened === null
      ? "null"
      : typeof widened === "object" && typeof (widened as { then?: unknown }).then === "function"
        ? "a thenable object (an async function is not an installer)"
        : typeof widened
  }. A raw plugin goes through .use(definePlugin(f)) or registerPlugin(f); a plugin package's installer is the name WITHOUT the Plugin suffix (localeDetector(), not localeDetectorPlugin()).`;

// Two copies of core share none of the module-scoped state below. DEV-only:
// production drops the call, then the import, then the module itself.
if (IS_DEV) claimCoreInstance(typeof __VERSION__ !== "undefined" ? __VERSION__ : "");

/** Type-only re-export so `full.ts` / `importMapLoader.ts` can import them from here. */
export type { LoaderFn, LoaderResult };

/**
 * @internal
 * The cross-module state + hook contract. Capability modules
 * (`core/loader.ts`, `core/plugins.ts`) see instances ONLY through this type
 * — never through the class, whose `_`-members are TS-private.
 *
 * MANGLING CONTRACT: every `_`-prefixed member below is renamed by the single
 * shared terser nameCache in `vite.shared.ts#mangleInternalProps`. That only
 * stays consistent across chunks because every core subpath entry is built by
 * ONE vite invocation (`coreEntries`). Access these members by DOT only —
 * never `i["_loader"]`, never `"_loadNs" in i`, never `Object.keys`-driven
 * logic over them.
 */
export interface I18nInternal<D extends DefaultTranslationParams = {}> extends I18nCoreInstance<D> {
  _locale: string;
  _fallbackLocales: string[];
  _cachedDefaultNs: string;
  _activeNamespaces: Set<string>;
  _emit<E extends I18nEvent>(event: E, data?: I18nEventData[E]): void;
  _setLoadingState(isLoading: boolean): void;

  // Named seams rather than a destroy registry: one optional call is markedly
  // cheaper than an array field + push + loop.
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

  _loadNs?: (locale: string, namespaces: string[], skipLoaded: boolean) => Promise<void>;
  _cancelNs?: (locale?: string, namespace?: string) => void;
  _beforeInit?: () => Promise<void>;
  _abortInit?: () => Promise<void>;
  _missHook?: (key: string, locale: string, namespace: string) => TranslationResult | undefined;

  /**
   * Read-only through the seam: the compiler is a constructor option and its
   * id is baked into every compiled-template cache key, so nothing may swap
   * it after construction.
   */
  readonly _compiler: MessageCompiler;
  _tagInterpolation?: TagInterpolationOptions;

  /** DEV-ONLY eager catalog check; absent from production builds. */
  _preflightSimpleCatalog?: (catalog: Record<string, unknown>) => void;

  // `instanceId` is PUBLIC (`I18nCoreExtraApi`) but writable only here: the
  // base declares it and never assigns it, so it is an own property exactly
  // when the discovery capability exposed the instance.
  instanceId: string | undefined;
  _globalEntry?: ComviQueueEntry;

  // `_currentLocaleChangeId`/`_requestedLocale` arbitrate rapid locale
  // switches; they live here rather than on the base because only the
  // `/loader` `setLocale` override can have a load in flight.
  _loader?: LoaderFn;
  _pendingLoads: Record<string, Promise<void> | undefined>;
  _nsGeneration: number;
  _currentLocaleChangeId: number;
  _requestedLocale: string;
}

/**
 * The base i18n instance: locale state, catalogs, translation and events.
 * Loading, plugins and devtools are opt-in capabilities layered on top.
 */
export class I18n<D extends DefaultTranslationParams = {}>
  implements I18nCoreInstance<D>, I18nCoreExtraApi
{
  /** `protected`, not `private`: the capability subclasses in `core/loader.ts` / `core/plugins.ts` read it. */
  protected _locale: string;
  public readonly messagesCache: MessagesCache;
  private _isInitializing: boolean = false;
  private _isInitialized: boolean = false;
  /**
   * `protected`, not `private`: the capability subclasses in `core/loader.ts` /
   * `core/plugins.ts` re-check it after their own awaits, which is the only way
   * an operation already in flight can find out that `destroy()` has landed.
   */
  protected _isDestroyed: boolean = false;
  /**
   * The one teardown attempt, stored so a repeat `destroy()` is the same
   * attempt rather than a resolved promise that lies about being finished.
   * Optional and never initialized, so an instance that was never destroyed does
   * not carry it as an own property. It does NOT replace `_isDestroyed`: the
   * flag has to be readable SYNCHRONOUSLY, because `init()`, `_beforeInit` and
   * `setLocale` re-read it right after their own awaits.
   */
  private _destroyAttempt?: Promise<void>;
  private _loadingCount: number = 0;
  protected _fallbackLocales: string[];
  public readonly apiKey: string | undefined;
  public readonly collectContext: boolean | undefined;
  public readonly devMode: boolean;
  /**
   * Assigned ONLY by the discovery capability (`core/devtools.ts`). `declare`:
   * the base must not emit an initializer, so on an instance that was never
   * exposed it is not an own property at all.
   */
  declare public readonly instanceId: string | undefined;
  private _cachedDefaultNs: string;
  private _initialNamespaces?: string[];
  /**
   * DEV-ONLY: `instanceId`/`exposeGlobal` were passed, so `init()` can say so
   * if discovery was never composed. Optional and never initialized, so the
   * production constructor neither assigns it nor makes it an own property.
   */
  private _devDiscoveryOptions?: boolean;
  private _strict: "dev" | "off";
  private _defaultParams?: DefaultTranslationParams;
  private _guaranteedDefaultParamKeys: readonly string[];
  private _configRevision = 0;
  /**
   * Counts every assignment of `_locale` after construction: here in
   * `setLocale` and in the loader's override, the only two. `protected` for
   * that override.
   */
  protected _localeRevision = 0;
  private _tagInterpolation?: TagInterpolationOptions;
  private _missingParam: MissingParamMode;
  protected _compiler: MessageCompiler;
  protected _compilerId: number;
  /**
   * The ONE universal post-processor: the `postProcess` constructor option.
   * No field initializer, so an instance that was not given one has no own property
   * for it — and `!this._postProcessor` is a sound emptiness test, because the
   * slot only ever holds a function or nothing.
   *
   * `protected`: CHAINING is the plugin capability's job. `registerPostProcessor`
   * owns the array and the loop (`core/plugins.ts`) and takes this slot over
   * with its own chaining applier on the first registration.
   */
  protected _postProcessor?: PostProcessFn;
  /**
   * The primary-catalog memo, ONE object mutated in place and never
   * reassigned: a `withMessages` view inherits this field through its
   * prototype, so its lookups refresh the instance's memo instead of growing a
   * divergent own copy on the view.
   */
  private _primary: {
    _msgs?: FlattenedMessages;
    _rev: number;
    _loc: string;
    _ns: string;
  } = { _rev: -1, _loc: "", _ns: "" };
  /**
   * A `withMessages` view's catalogs, keyed `"locale:namespace"`. An own
   * property of the view only, never of the instance. Read by `_template`
   * (for `_translate` and `hasTranslation`) and by `tRaw`'s fast path, which
   * it turns off.
   */
  private _overlay?: Readonly<Record<string, FlattenedMessages>>;

  protected _activeNamespaces = new Set<string>();

  // Capability seams (`_loadNs`, `_cancelNs`, `_loader`) are deliberately NOT
  // declared here: the composite subclass declares them as real methods
  // (`core/loader.ts`, `core/plugins.ts`) and `attach*` copies those
  // descriptors onto a base instance. The base only ever READS them, through
  // the `I18nInternal` cast — which emits nothing.

  private _eventCallbacks: Partial<Record<I18nEvent, Set<(data?: unknown) => void>>> =
    Object.create(null);

  private _fallbackOnMissingKey?: (info: {
    key: string;
    locale: string;
    namespace: string;
  }) => TranslationResult | void;
  private _onError?: (error: Error, context?: ErrorReportContext) => void;
  /** Errors this instance already reported. Per instance, so a shared or rethrown
   * error still reaches every other instance, and the caller's object is not
   * mutated. */
  private _reported = new WeakSet<Error>();

  /**
   * @param compiler Defaults to `options.compiler`, then to the simple
   * `{param}` compiler, so the published `new I18n(options)` stays a
   * one-argument constructor. Its identity is part of every template cache key
   * this instance produces.
   */
  constructor(
    options: I18nOptions<D>,
    compiler: MessageCompiler = options.compiler ?? simpleCompiler,
  ) {
    if (!options.locale) {
      throw new Error(ERR_LOCALE_NOT_SET);
    }
    this._compiler = compiler;
    this._compilerId = getCompilerId(compiler);
    this._missingParam = options.missingParam ?? "literal";

    this._locale = options.locale;
    const defaultNs = options.defaultNs ?? DEFAULT_NS;
    const initialNamespaces = options.ns;
    this._cachedDefaultNs = defaultNs;
    this.messagesCache = new MessagesCache({ defaultNs });
    this._initialNamespaces = initialNamespaces ? [...new Set(initialNamespaces)] : undefined;

    // `concat` copies: the chain is instance-owned, so a caller mutating the array
    // it passed cannot change output behind `configChanged`.
    this._fallbackLocales = ([] as string[]).concat(options.fallbackLocale ?? []);

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
                  IS_DEV
                    ? `[@comvi/core] Missing handler for tag: <${tagName}>`
                    : "E_MISSING_TAG_HANDLER",
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
      this._postProcessor = options.postProcess;
    }

    if (options.messages !== undefined) {
      if (
        typeof options.messages !== "object" ||
        options.messages === null ||
        Array.isArray(options.messages)
      ) {
        throw new Error(ERR_MESSAGES_NOT_OBJECT);
      }

      if (IS_DEV) {
        // Own keys, so this validates exactly the entries `_nsAddMessages`
        // will go on to ingest — no more and no less.
        for (const key of Object.keys(options.messages)) {
          const value = options.messages[key];
          if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error(ERR_MESSAGES_NOT_OBJECT);
          }
        }
      }

      this._nsAddMessages(options.messages);
    }

    this.apiKey = options.apiKey;

    // `undefined` means the in-context editor's own default (on).
    this.collectContext = options.collectContext;

    this.devMode = options.devMode ?? IS_DEV;

    // Discovery (`window.__COMVI__`) is deliberately NOT here: it is the
    // `core/devtools.ts` capability, which is where `options.exposeGlobal` /
    // `options.instanceId` are read. All the base does is REMEMBER that one of
    // them ASKED for discovery, so `init()` can report it as inert if that
    // capability never arrives.
    //
    // `exposeGlobal: false` is deliberately NOT a request: it asks for the
    // absence a base instance already delivers, so there is nothing to report and
    // no reason to flag the 0.4 boilerplate that carries it.
    if (IS_DEV && (options.instanceId !== undefined || options.exposeGlobal === true)) {
      this._devDiscoveryOptions = true;
    }
  }

  /**
   * Apply a capability installer — the ONE composition verb.
   *
   * ```ts
   * const i18n = createI18n({ locale: "en" }).use(loader({ uk: () => import("./uk.json") }));
   * ```
   *
   * An installer widens the instance IN PLACE and returns IT: `use(f)` calls
   * `f(this)` and hands back `this`, retyped to whatever the installer's return
   * type says it widened to. No registry, no ordering, no capability semantics.
   * `attachLoader` / `attachPlugins` / `attachDevtools` are themselves valid
   * installers; the `loader(map)` / `plugins()` / `devtools()` factories exist to
   * CONFIGURE the capability in the same call.
   *
   * Anything else is refused with `code: "E_USE_NOT_INSTALLER"`. Identity —
   * rather than a shape probe — is what makes ONE verb safe: a raw plugin is
   * also a function of the instance, and an ASYNC one returns a Promise, which any
   * "is it an object?" test would wave through and then leave running at
   * composition time with its rejection unhandled. A raw plugin goes through
   * `.use(definePlugin(f))` or `registerPlugin(f)` instead.
   *
   * `T extends this` states the identity rule at the TYPE level too, so the
   * three misuse shapes — a derived object, an async installer, an installer
   * that returns nothing — are compile errors rather than runtime ones, while
   * every widening installer (`loader(map)`, `plugins()`, `definePlugin()`, a bare
   * `attachLoader`, a hand-written in-place step) still infers and widens. The
   * runtime guard stays: a JS caller, or an `any`-typed one, reaches it anyway.
   *
   * Vue's wrapper enforces the same rule one level up, over `i18n.core`, and
   * reports it under the wrapper's own code `E_USE_INSTANCE_IDENTITY`.
   */
  public use<T extends this>(installer: (instance: this) => T): T {
    const widened: unknown = installer(this);
    if (widened !== this) {
      // The function already RAN, so a raw ASYNC plugin has a live promise
      // here. The error below is the report; that promise's rejection is not,
      // and leaving it floating would print an unhandled rejection on top of
      // an already-clear diagnostic. Swallow it, and only it.
      if (typeof (widened as { then?: unknown } | null | undefined)?.then === "function") {
        void (widened as Promise<unknown>).then(undefined, () => {});
      }
      const error = new Error(
        IS_DEV ? useNotInstallerMessage(widened) : "E_USE_NOT_INSTALLER",
      ) as Error & {
        code: "E_USE_NOT_INSTALLER";
      };
      error.code = "E_USE_NOT_INSTALLER";
      throw error;
    }
    return widened as T;
  }

  /**
   * The in-flight init attempt. Concurrent callers join it; it is cleared once
   * it settles, so a later sequential `init()` is a new attempt.
   */
  // `unknown`, not `this`: a `this`-typed private field changes how an instance
  // type intersects with the capability APIs.
  private _initAttempt?: Promise<unknown>;

  public init(): Promise<this> {
    let attempt = this._initAttempt;
    if (!attempt) {
      // The slot is filled BEFORE `_init()` runs: `_init()` emits
      // `loadingStateChanged` synchronously, and a listener that calls
      // `init()` from there must join this attempt, not start a second one.
      // `_init()` itself still starts synchronously, so `isInitializing` is
      // true the moment `init()` returns.
      // `_init()`'s `finally` clears the slot. That needs no identity check:
      // the slot is only ever filled while empty, so it holds this attempt.
      let run!: (result: Promise<this>) => void;
      this._initAttempt = attempt = new Promise((resolve) => (run = resolve));
      run(this._init());
    }
    return attempt as Promise<this>;
  }

  private async _init(): Promise<this> {
    // Set once this attempt has started: a destroy() after that point ends the
    // attempt quietly, while init() on an already-destroyed instance still throws.
    let started = false;
    try {
      if (this._isDestroyed) {
        throw new Error(ERR_INSTANCE_DESTROYED);
      }

      // An option whose capability was never composed does nothing, and doing
      // nothing quietly is what makes it cost an afternoon. Reported HERE
      // rather than in the constructor because both capabilities are legally
      // composed after construction and before `init()`. Once per SUCCESSFUL
      // init: a second `init()` finds `_isInitialized` set and stays
      // quiet (a concurrent one joins this attempt and never gets here). A first `init()`
      // that THREW leaves both flags clear, so the retry warns again — which
      // is right, the capability is still missing. A destroyed instance never
      // reaches here at all; it throws above.
      // DEV-only — a missing capability is not a boundary violation, so
      // production stays fail-soft and silent.
      if (IS_DEV && !this._isInitialized && !this._isInitializing) {
        const internal = this as unknown as I18nInternal;
        if (this._initialNamespaces?.length && internal._loadNs === undefined) {
          warn(
            `[@comvi/core] options.ns (${this._initialNamespaces.join(", ")}) needs the loader ` +
              `capability; this i18n instance has none, so init() loads nothing. Compose it: ` +
              `createI18n(options).use(loader(map)).`,
          );
        }
        if (this._devDiscoveryOptions && internal._initDevtools === undefined) {
          warn(
            `[@comvi/core] options.instanceId / options.exposeGlobal need the discovery ` +
              `capability; this i18n instance has none, so neither does anything. Compose it: ` +
              `createI18n(options).use(devtools({ instanceId })).`,
          );
        }
      }

      started = this._isInitializing = true;
      this._setLoadingState(true);

      // Plugins first, then any plugin-registered locale detector: a detector
      // must be able to change the locale before namespaces are loaded.
      await (this as unknown as I18nInternal)._beforeInit?.();

      // `destroy()` can land during EVERY await in this method, so the flag is
      // re-read after each one. An instance destroyed mid-init RESOLVES QUIETLY:
      // `this` back, `isInitialized` still false, no `initialized` emit, no
      // `reportError`. The normal producer of this race is a binding whose
      // component unmounted while its fire-and-forget `init()` was in flight
      // (react/solid/svelte providers, vue's `install()`, next's
      // `ensureInitialized`, nuxt's request instance) — turning every unmount into
      // a reported error would be worse than a resolve whose `isInitialized`
      // honestly reads false. Pinned by tests/features/destroy-races.test.ts.
      //
      // The check BEFORE the namespace load matters on its own: destroy()
      // cleared the active-namespace set and the cache, and loading here would
      // put both back.
      if (this._isDestroyed) return this;

      const namespacesToLoad = this._initialNamespaces ?? [this._cachedDefaultNs];
      if (namespacesToLoad.length > 0) {
        await this._nsAddActiveNamespaces(namespacesToLoad);
      }

      if (this._isDestroyed) return this;

      this._isInitialized = true;
      this._emit("initialized");
      return this;
    } catch (error) {
      // A failure that settles after destroy() is part of the same quiet end:
      // nothing to report, and destroy() already released what was acquired.
      if (started && this._isDestroyed) return this;
      this.reportError(error as Error, { source: "init" });
      // Transactional: release what this attempt's plugins acquired before
      // rejecting, so a rejected or retried instance holds nothing extra.
      await (this as unknown as I18nInternal)._abortInit?.();
      throw error;
    } finally {
      this._isInitializing = false;
      this._setLoadingState(false);
      this._initAttempt = undefined;
    }
  }

  /**
   * Subscribe to an i18n event.
   * @returns Unsubscribe function.
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
    // Fire-and-forget: the synchronous setter cannot await the namespace load,
    // so a failure is surfaced as an event instead. Already went through
    // reportError — do not log it a second time.
    this.setLocale(value).catch((error) => {
      this._emit("loadError", {
        locale: value,
        namespace: "locale-change",
        error: error as Error,
      });
    });
  }

  /**
   * Set the locale and emit `localeChanged`.
   *
   * The base transition is synchronous by construction: a bare instance has no
   * loader, so there is nothing to await. `@comvi/core/loader` OVERRIDES this
   * method with the guarded version (changeId staleness, mid-flight
   * cancellation, loading refcount); both paths keep this `Promise`-returning
   * signature.
   */
  async setLocale(value: string): Promise<void> {
    if (this._locale === value) return;

    const oldLocale = this._locale;
    this._locale = value;
    this._localeRevision++;
    this._emit("localeChanged", { from: oldLocale, to: value });
  }

  setFallbackLocale(fallback: string | readonly string[]) {
    // Copied, as in the constructor.
    this._fallbackLocales = ([] as string[]).concat(fallback);
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

  get localeRevision(): number {
    return this._localeRevision;
  }

  private _withDefaultParams(userParams?: TranslationParams): TranslationParams | undefined {
    const defaults = this._defaultParams;
    if (defaults === undefined) return userParams;
    return { ...defaults, ...userParams };
  }

  /**
   * Clear translations from the cache. An omitted `locale` clears every locale,
   * an omitted `namespace` every namespace.
   *
   * This clears CONTENT, not intent — in EVERY form. The ACTIVE namespace set
   * is left alone, so `reloadMessages()` and a following locale switch
   * still know what to fetch; the editor-save and webhook-refresh flow is
   * exactly "drop everything, fetch it again".
   *
   * Deactivating a namespace is `removeActiveNamespace(ns)` on the loader
   * capability (`@comvi/core/loader`). The default namespace is always
   * reloadable — a reload with nothing active refetches its CONTENT — but the
   * reload does not re-activate it; only `addMessages()` does that.
   */
  clearMessages(locale?: string, namespace?: string): void {
    // Cancel in-flight loads for the cleared scope so they don't repopulate it.
    (this as unknown as I18nInternal)._cancelNs?.(locale, namespace);

    if (locale) {
      this.messagesCache.delete(locale, namespace);
    } else if (namespace) {
      for (const loc of this.messagesCache.getLocales()) {
        this.messagesCache.delete(loc, namespace);
      }
    } else {
      this.messagesCache.clear();
    }

    this._emit("messagesCleared", { locale, namespace });
  }

  /**
   * Merge catalogs into the cache. Keys are `locale` or `"locale:namespace"`;
   * an empty map is a no-op. Emits `namespaceLoaded` per catalog.
   */
  addMessages(messages: MessagesMap) {
    this._nsAddMessages(messages);
  }

  getMessages(locale: string = this._locale, namespace: string = this._cachedDefaultNs) {
    return this.messagesCache.get(locale, namespace) ?? {};
  }

  hasLocale(locale: string, namespace?: string): boolean {
    return this.messagesCache.has(locale, namespace ?? this._cachedDefaultNs);
  }

  hasTranslation(
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks: boolean = false,
  ): boolean {
    const loc = locale ?? this._locale;
    const ns = namespace ?? this._cachedDefaultNs;
    if (this._template(loc, ns, key) !== undefined) {
      return true;
    }
    if (checkFallbacks) {
      for (const fallbackLoc of this._fallbackLocales) {
        if (fallbackLoc === loc) continue;
        if (this._template(fallbackLoc, ns, key) !== undefined) {
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

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Reference-counted so overlapping async loads emit one state change.
   * `_isInitializing` is owned by `init()` exclusively — nested loads (e.g. a
   * locale detector calling setLocale mid-init) must not clear it.
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
   * The rich-text half of {@link I18n.t}, keyed identically: ONE signature, so
   * a wrong call names its own problem on the first line.
   */
  tRaw<
    K extends { [P in AcceptedCoreKey]: P }[AcceptedCoreKey] | NamespacedKeys<N> | null,
    N extends Namespaces = never,
  >(translationKey: K, ...params: ArgsFor<K, undefined, D, N>): TranslationResult;

  tRaw(translationKey: string | null, ...params: [TranslationParams?]): TranslationResult {
    if (translationKey === null) {
      return "";
    }

    const key = translationKey as string;
    const userParams = params[0];

    // Fast path: a template with no placeholders needs no compile at all. It
    // reads the cache's primary catalog, so a `withMessages` call skips it.
    if (userParams == null && !this._postProcessor && !this._overlay) {
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
   * Translate a key in the current locale. ONE signature — see
   * {@link AcceptedCoreKey} for the keys it takes and {@link ArgsFor} for how
   * the params are dispatched on the key.
   */
  t<
    K extends { [P in AcceptedCoreKey]: P }[AcceptedCoreKey] | NamespacedKeys<N> | null,
    N extends Namespaces = never,
  >(translationKey: K, ...params: ArgsFor<K, undefined, D, N>): string;

  t(translationKey: string | null, ...params: [TranslationParams?]): string {
    return translationResultToString(this.tRaw(translationKey as any, ...(params as any)));
  }

  /**
   * A read view of the instance: `t`, `tRaw` and `hasTranslation` that read
   * each key from `catalogs` first and from the cache otherwise — the merge
   * `addMessages(catalogs)` would make, without making it. The view never
   * writes the i18n instance — no cache entry, no locale, no active namespace —
   * and never emits a publication event (`namespaceLoaded`, `localeChanged`),
   * so a view a caller drops leaves nothing behind. Translation diagnostics
   * are not publication: a missing key emits `missingKey`, and a throwing
   * post-processor reaches `onError`, as for any `t()` call. Later
   * `addMessages` reach it through the cache for every key `catalogs` does
   * not hold. `catalogs` is keyed `"locale:namespace"` and holds flat
   * catalogs, as `flattenCatalog` returns them.
   */
  withMessages(catalogs: Readonly<Record<string, FlattenedMessages>>): I18nMessagesView<D> {
    // The receiver inherits the instance and holds `catalogs` as its only own
    // property; it stays private, so only the three reads reach the caller.
    const view = Object.create(this) as this;
    view._overlay = catalogs;
    return {
      t: view.t.bind(view),
      tRaw: view.tRaw.bind(view),
      hasTranslation: view.hasTranslation.bind(view),
    } as I18nMessagesView<D>;
  }

  /**
   * The template a lookup reads, key by key: a `withMessages` view's catalog
   * first, then the cache — the same merge `addMessages` would make, so a
   * partial catalog never hides a cached key.
   *
   * An EMPTY string is not a template. It is the value nobody has written yet
   * — what a translation platform publishes for an untranslated key — so it
   * reads as absent here, the one place every lookup goes through: `t()` walks
   * the fallback chain past it, `hasTranslation()` says no, and a key that is
   * empty in every locale takes the missing-key path like any other.
   */
  private _template(
    locale: string,
    namespace: string,
    key: string,
  ): FlattenedMessages[string] | undefined {
    return (
      this._overlay?.[locale + ":" + namespace]?.[key] ||
      (locale === this._locale && namespace === this._cachedDefaultNs
        ? this._getPrimaryTranslations()
        : this.messagesCache.get(locale, namespace))?.[key] ||
      undefined
    );
  }

  private _getPrimaryTranslations(): FlattenedMessages | undefined {
    const revision = this.messagesCache.getRevision();
    const memo = this._primary;
    if (
      memo._rev === revision &&
      memo._loc === this._locale &&
      memo._ns === this._cachedDefaultNs
    ) {
      return memo._msgs;
    }

    const translations = this.messagesCache.get(this._locale, this._cachedDefaultNs);
    memo._msgs = translations;
    memo._rev = revision;
    memo._loc = this._locale;
    memo._ns = this._cachedDefaultNs;
    return translations;
  }

  private _translate(
    translationKey: string,
    currentLocale: string,
    defaultNamespace: string,
    fallbackLocales: string[],
    params?: TranslationParams,
  ): TranslationResult {
    // Drop any ICU hit left behind by a compile this call did not make (a
    // `translate()` that threw before its read-and-clear, or a compile outside
    // the instance). This is what makes every read below attributable to THIS call.
    if (!IS_DEV) clearIcuHit();
    const hasParams = params != null;
    const locale = hasParams && params.locale !== undefined ? params.locale : currentLocale;
    const namespace = hasParams && params.ns !== undefined ? params.ns : defaultNamespace;
    const skipPostProcess = !this._postProcessor;
    // `params.tagInterpolation` merges over the instance option for this call
    // only; a no-op when there are no params.
    const tagInterpolation = mergeTagInterpolation(
      this._tagInterpolation,
      params?.tagInterpolation,
    );

    let template = this._template(locale, namespace, translationKey);
    let templateLocale = locale;
    for (let i = 0; template === undefined && i < fallbackLocales.length; i++) {
      template = this._template((templateLocale = fallbackLocales[i]), namespace, translationKey);
    }

    if (template !== undefined) {
      const result = translate(
        template,
        templateLocale,
        params,
        tagInterpolation,
        this._compiler,
        this._missingParam,
      );
      // The compile that just ran may have rendered an ICU segment literally.
      // Read-and-clear here, where the key/namespace/locale telemetry exists,
      // with the locale that actually compiled.
      if (!IS_DEV && icuHit !== undefined) {
        this._reportIcuLiteral(translationKey, namespace, templateLocale);
      }
      return skipPostProcess
        ? result
        : this._postProcess(result, translationKey, namespace, params);
    }

    const missingResult = this._handleMissingTranslation(
      translationKey,
      locale,
      namespace,
      params,
      tagInterpolation,
    );
    // A per-call `params.fallback` is a TEMPLATE compiled here, having bypassed
    // ingestion entirely — so it needs the same read-and-clear.
    if (!IS_DEV && icuHit !== undefined) {
      this._reportIcuLiteral(translationKey, namespace, locale);
    }
    return skipPostProcess
      ? missingResult
      : this._postProcess(missingResult, translationKey, namespace, params);
  }

  /**
   * Report an ICU segment the default compiler just rendered literally. Fires
   * on the COMPILATION, so a cached render never re-reports. Without an
   * `onError` handler production would be silent, so this one path also writes
   * to the console — `reportError` itself is unchanged.
   */
  private _reportIcuLiteral(key: string, namespace: string, locale: string): void {
    const err = new Error("E_ICU_SYNTAX") as IcuSyntaxError;
    err.code = "E_ICU_SYNTAX";
    err.argumentType = icuHit!;
    clearIcuHit();
    if (!this._onError) console.error("[@comvi/core] E_ICU_SYNTAX", key, locale);
    this.reportError(err, { source: "compile", key, namespace, locale });
  }

  /**
   * Apply the slot, swallowing a throw — UNIVERSAL, because the `postProcess`
   * constructor option is. A throw must not reach `t()`, so the un-processed
   * result is returned instead and reported as `source: "post-processor"`.
   *
   * With the plugin capability composed the slot holds its chaining applier,
   * which catches per processor so one throw cannot abort the rest; this
   * `try` is then the outer net that never fires.
   */
  private _postProcess(
    result: TranslationResult,
    key: string,
    namespace: string,
    params?: TranslationParams,
  ): TranslationResult {
    try {
      return this._postProcessor!(result, key, namespace, params ?? {});
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.reportError(err, { source: "post-processor", key, namespace });
      return result;
    }
  }

  private _handleMissingTranslation(
    key: string,
    locale: string,
    namespace: string,
    params?: TranslationParams,
    tagInterpolation?: TagInterpolationOptions,
  ): TranslationResult {
    if (this._strict === "dev") {
      warn(IS_DEV ? `[@comvi/core] Translation not found: "${key}"` : "E_TRANSLATION_NOT_FOUND", {
        key,
        locale,
        namespace,
      });
    }

    this._emit("missingKey", { key, locale, namespace });

    // The plugin missing-key callbacks always run — plugins track misses
    // through side effects — but the first defined result wins.
    let fallbackValue = (this as unknown as I18nInternal)._missHook?.(key, locale, namespace);

    // A per-call fallback outranks the instance-level handler.
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

  /** Locale codes that currently have translations loaded. */
  public getLoadedLocales(): string[] {
    return this.messagesCache.getLocales();
  }

  /**
   * Report to the configured `onError` handler, or `warn()` in dev when there
   * is none. Remembers the error on THIS instance so a rethrow cannot report it
   * twice to the same instance; another instance still sees it.
   */
  public reportError(error: unknown, context?: ErrorReportContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this._reported.has(err)) return;
    this._reported.add(err);

    if (this._onError) {
      try {
        this._onError(err, context);
      } catch (e) {
        if (IS_DEV) {
          warn(`[@comvi/core] onError handler threw: ${(e as Error).message}`);
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
      warn(`[@comvi/core] ${ctx}${detail ? ` (${detail})` : ""}: ${err.message}`);
    }
  }

  protected async _nsAddActiveNamespaces(namespaces: string[]): Promise<void> {
    // Optimistic: on a failed load the namespace stays active, so the next
    // locale switch retries it instead of requiring a manual retry.
    for (const ns of namespaces) this._activeNamespaces.add(ns);
    await (this as unknown as I18nInternal)._loadNs?.(this._locale, namespaces, true);
  }

  /**
   * Merge a `{ locale | "locale:ns": catalog }` map into the cache.
   *
   * Flattening is UNCONDITIONAL and lives here, in the base: `{ nav: { home } }`
   * and `{ "nav.home": … }` are the same catalog on every instance, whether or not
   * anything is composed onto it. It used to be an optional `_flattenNs`
   * capability hook, which made a nested inline catalog type-check and then
   * resolve as missing on a base instance.
   */
  private _nsAddMessages(translations: MessagesMap): void {
    // OWN keys: `for...in` walked the prototype chain of the outer map, so a
    // map built on a prototype that carries locale entries had those adopted
    // as though the caller had passed them.
    const localeKeys = Object.keys(translations);
    for (let k = 0; k < localeKeys.length; k++) {
      const localeOrKey = localeKeys[k];
      // `normalizeTranslationObject` returns a FRESH null-prototype object, so
      // this is also the prototype-pollution guard — one copy, here, where the
      // raw object enters. Input that is already prototype-less is taken as
      // normalized and passes through without a second copy.
      // `?? {}` keeps the documented leniency of a `null`/`undefined` locale
      // value (an empty catalog plus the event), which the old shallow
      // `Object.assign` gave for free and `Object.getPrototypeOf` would throw on.
      const flat = normalizeTranslationObject(translations[localeOrKey] ?? {});

      if (IS_DEV) {
        (this as unknown as I18nInternal)._preflightSimpleCatalog?.(flat);
      }

      const colonIdx = localeOrKey.indexOf(":");
      const loc = colonIdx === -1 ? localeOrKey : localeOrKey.slice(0, colonIdx);
      const ns = colonIdx === -1 ? this._cachedDefaultNs : localeOrKey.slice(colonIdx + 1);

      // Only a genuine MERGE copies again: `Object.assign` out of a
      // dictionary-mode (null-prototype) source has no V8 fast path and costs
      // ~130 ns PER KEY, so storing `flat` directly on the first write is what
      // keeps `new I18n({ messages })` from being 2.5x slower.
      // This write is newer than any load already in flight for the same
      // catalog: invalidate it, or its older response would replace the merge.
      (this as unknown as I18nInternal)._cancelNs?.(loc, ns);
      const existing = this.messagesCache.get(loc, ns);
      this.messagesCache.set(
        loc,
        ns,
        existing ? Object.assign(Object.create(null), existing, flat) : flat,
      );

      this._activeNamespaces.add(ns);
      this._emit("namespaceLoaded", { namespace: ns, locale: loc });
    }
  }

  /**
   * Tear the instance down; it cannot be re-initialized afterwards.
   *
   * A repeat call is the SAME attempt, not a second teardown and not a
   * resolved promise: `await i18n.destroy()` means the plugin cleanups have
   * FINISHED even for a caller who arrived while the first call was still
   * awaiting them. Two callers is the normal case — a binding unmounting twice,
   * a request instance torn down by both the response hook and an error path — and
   * the old early `return` told the second one that cleanup was done before it
   * had begun to finish.
   */
  public destroy(): Promise<void> {
    // `_destroy()` sets `_isDestroyed` before its first await, so the flag is
    // true the instant this returns, exactly as the old assignment was.
    return (this._destroyAttempt ??= this._destroy());
  }

  private async _destroy(): Promise<void> {
    this._isDestroyed = true;

    // Phase 0 — discovery removal, before any lifecycle reset.
    (this as unknown as I18nInternal)._disposeDevtools?.();

    // Phase 1 — awaited cleanup, while capability state is still live.
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
    this._postProcessor = undefined;

    this.messagesCache.clear();

    // Phase 3 — capability reset, after the `destroyed` listeners have seen the
    // still-live capability state.
    const self = this as unknown as I18nInternal;
    self._resetLoader?.();
    self._resetPlugins?.();
  }
}

// Eager catalog preflight at both ingestion seams (`_nsAddMessages` and
// the loader's pre-merge call). In development a string the instance's compiler
// cannot compile throws `E_ICU_SYNTAX` at ingestion instead of at first render;
// production stays lazy and reports on the compilation that hits it.
// The whole block is folded out of production builds by `__DEV__`.
//
// It runs for whichever compiler opted in (`preflight`), which is both shipped
// ones. A user-supplied compiler is excluded by default: its `makeArgToken` is
// third-party code, and a throw from it would reject the whole catalog.
//
// The preflight raises the compiler's ICU diagnostics and NOTHING else — it
// passes `silenceUnclaimedTagWarning` on every parse. Whether a `<b>` in the
// catalog is a mistake depends on how the string is rendered, which ingestion
// cannot know: an app whose `<T>` supplies the tag grammar per call renders it
// correctly with no extension on the instance. Only the render path knows, and it
// warns there.
if (IS_DEV) {
  (I18n.prototype as unknown as I18nInternal)._preflightSimpleCatalog = function (
    this: I18nInternal,
    catalog: Record<string, unknown>,
  ): void {
    const compiler = this._compiler;
    if (compiler.preflight !== true) return;
    // The EFFECTIVE extension set, not an empty one: an instance whose app imported
    // `@comvi/core/tags` really does claim `<`, and only then does the parse
    // descend into tag children — where a broken argument still has to be found.
    const extensions = effectiveExtensions(this._tagInterpolation?.extensions);
    // Branch text is stored verbatim by the ICU compiler and only compiled at
    // render, so the walk descends into every plural/select sub-message (and
    // through tag children) — a broken argument one level down must still fail
    // at ingestion, not at first `t()` inside a component.
    const walk = (tokens: ParsedToken[], hashIsSyntax: boolean): void => {
      for (const token of tokens) {
        const kind = token[0];
        if (kind === TK_PLURAL || kind === TK_SELECT) {
          const choices = token[3];
          if (choices) {
            const nestedHash = kind === TK_PLURAL || hashIsSyntax;
            for (const branch in choices) {
              walk(
                parseTemplate(choices[branch], nestedHash, extensions, compiler, true),
                nestedHash,
              );
            }
          }
        } else if (kind === TK_TAG) {
          walk(token[2], hashIsSyntax);
        }
      }
    };
    for (const key in catalog) {
      const value = catalog[key];
      if (typeof value === "string") {
        const tokens = parseTemplate(value, false, extensions, compiler, true);
        walk(tokens, false);
      }
    }
  };
}
