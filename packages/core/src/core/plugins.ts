// Plugin-host capability — the implementation half of `@comvi/core/plugins`.
//
// ONE implementation, TWO install surfaces (plan M-1), exactly as
// `core/loader.ts`: the capability is a class body, `I18nWithPlugins`.
//   • composite — `core/full.ts` copies this prototype's own descriptors onto
//            `I18n.prototype` at module scope (the composite already spends its one
//            `extends` slot on the loader capability, and this class must NOT
//            extend `I18nWithLoader` — that would drag the loader into a
//            base+plugins-only module graph);
//   • base host — `attachPlugins(i18n)` copies the same descriptors onto the
//            instance.
// Class-body methods are non-enumerable / writable / configurable, so both
// surfaces are reflectively identical to the pre-Phase-7 class
// (`tests/root-contract.test.ts`).
//
// MANGLING CONTRACT (plan R2): the `_`-prefixed members below are renamed by
// the single shared terser nameCache (`vite.shared.ts#mangleInternalProps`),
// which is only consistent because every core entry — including this one — is
// built by ONE vite invocation (`coreEntries`). Dot access and method
// definitions are what terser can correlate: never install or read a `_`
// member through a string. `tests/dist/base-composition.dist.test.ts` is the
// canary.
import type {
  DefaultTranslationParams,
  I18nPluginHost,
  I18nPluginHostApi,
  PostProcessFn,
  TranslationResult,
} from "../types";
import { I18n as I18nBase, type I18nInternal } from "./i18n";
import type { I18nPlugin as I18nPluginFn, PluginOptions } from "../plugins/types";
import { warn } from "../logger";
import { warnLateCompose } from "../utils/lateCompose";
import { LOADER_MEMBERS, capabilityShim } from "../utils/capability";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const ERR_REGISTER_LOCALE_DETECTOR = IS_DEV
  ? "[i18n] registerLocaleDetector(): argument must be a function."
  : "E_REGISTER_LOCALE_DETECTOR";

/**
 * B2 — the plugin queue is drained inside `init()` and never again, so a
 * plugin registered afterwards silently never runs. Both of the ways to get
 * there (composing the host late, queueing into an already-composed host late)
 * name the same rule.
 *
 * Dev-only by construction: the strings are behind `IS_DEV` at every call
 * site, so terser drops them — and the WeakSet with them — from a prod build.
 */
const ERR_LATE_PLUGINS = IS_DEV
  ? "[i18n] .with(plugins()) ran after init(): compose capabilities before init(). The plugin queue is drained inside init() and never again, so a plugin queued now will never run. Create the host, compose it, then init()."
  : "";

const ERR_LATE_USE = IS_DEV
  ? "[i18n] use() was called after init(): compose capabilities before init(). The plugin queue is drained inside init() and never again, so this plugin will never run."
  : "";

const ERR_PLUGIN_INIT_RETURN = IS_DEV
  ? "[i18n] A plugin returned a value. A plugin may only return nothing (`undefined`) or a cleanup function, so nothing was registered. If this was a lowercase installer, compose it with `.with(installer(…))` — `.use()` runs it as a plugin and it hands the host back. If it was your own plugin, use a statement body: `(i18n) => { flag = true; }`."
  : "E_PLUGIN_INIT_RETURN";

/** @internal Registered plugin tuple; owned by the plugin capability. */
export type PluginEntry = [
  plugin: I18nPluginFn,
  required: boolean,
  timeout: number,
  onError?: (error: Error) => void,
];

/**
 * The plugin-host capability. Not exported from any entry point: the composite
 * composite installs it on its prototype, a base host gets it via `attachPlugins`.
 *
 * Members are accessed through `this` exactly as they were when they lived in
 * the base class — aliasing it to a local shrinks the minified size but
 * measurably WORSENS the gzipped size, so `protected declare` re-declarations
 * are used instead of per-access casts.
 */
export class I18nWithPlugins<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  /** Plugin-owned state; created by `_initPlugins`, never by a field initializer. */
  declare protected _plugins: PluginEntry[];
  declare protected _pluginCleanups: Array<() => void | Promise<void>>;
  declare protected _pluginData: Record<string, unknown>;
  declare protected _localeDetector?: () => string | Promise<string>;
  declare protected _missingKeyCallbacks: Set<
    (key: string, locale: string, namespace: string) => TranslationResult | void
  >;

  /**
   * TRANSIENT: true only while `_beforeInit` has a plugin function on the
   * stack. It is the whole state behind `ensureInstallable` below — the
   * plugins-only nested-use guard — and it is deliberately NOT created by
   * `_initPlugins`: a host that never ran `init()` has no own property for
   * it, on the composite and on an attached base host alike.
   */
  declare protected _pluginInit?: boolean;

  /**
   * Initialize plugin-owned state. Called by the composite's constructor and by
   * `attachPlugins`; this class declares no constructor of its own.
   */
  protected _initPlugins(): void {
    this._plugins = [];
    this._pluginCleanups = [];
    this._pluginData = Object.create(null);
    this._missingKeyCallbacks = new Set();
  }

  /**
   * Destroy phase 1: awaited before any lifecycle reset or emit, so cleanups
   * observe live capability state. LIFO iteration and per-cleanup error
   * handling are the pre-Phase-7 behavior verbatim.
   */
  protected async _preDestroy(): Promise<void> {
    while (this._pluginCleanups.length) {
      try {
        await this._pluginCleanups.pop()!();
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "plugin-cleanup",
        });
      }
    }
  }

  /**
   * Destroy phase 3: the reset runs only after the `destroyed` listeners have
   * observed the still-live state (two-phase destroy contract). Re-running
   * the initializer restores exactly the constructed state — a fresh
   * `_missingKeyCallbacks` is indistinguishable from a cleared one, since the
   * disposer `onMissingKey` returns reads the field off `this`.
   */
  protected _resetPlugins(): void {
    this._initPlugins();
    this._localeDetector = undefined;
  }

  /**
   * Register a plugin (chainable)
   *
   * MUST be called BEFORE `init()`. The queue is drained once, inside
   * `init()`, and re-running it is not supported (a plugin's cleanup and the
   * lifecycle events around it assume a single drain), so a plugin registered
   * afterwards never runs. Doing it warns in dev and is a no-op in prod.
   * Registering from INSIDE a plugin is fine: `init()` has not completed yet,
   * and the drain loop picks the new entry up.
   *
   * @param plugin - The plugin to register
   * @param options - Plugin options (required, timeout, onError)
   * @returns this for chaining
   */
  public use(plugin: I18nPluginFn, options?: PluginOptions): this {
    if (IS_DEV && this.isInitialized) warnLateCompose(this, ERR_LATE_USE);
    this._plugins.push([
      plugin,
      options?.required ?? true,
      options?.timeout ?? 10000,
      options?.onError,
    ]);
    return this;
  }

  /**
   * @internal `_beforeInit` hook — run the registered plugins, then hand over
   * to a plugin-registered locale detector. Order is init's pre-Phase-7
   * sequence exactly: plugins first, detector second (through the public
   * `setLocaleAsync`, so namespaces load before the locale applies).
   */
  protected async _beforeInit(): Promise<void> {
    for (const [plugin, required, timeout, onError] of this._plugins) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      // The guard window is exactly one plugin invocation: `ensureInstallable`
      // reads this flag, and the locale detector below is not a plugin.
      this._pluginInit = true;
      try {
        const result: unknown = await Promise.race([
          // `I18nPluginHost` is the `{}`-defaults host surface; an instance
          // with constructor-guaranteed defaults narrows `setDefaultParams`,
          // which the interface's property-style declaration checks strictly.
          // The class was bivariant here before the type split — preserved.
          plugin(this as unknown as I18nPluginHost),
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
        // Only `undefined` and a cleanup function are legal. Anything else —
        // an installer handing the host back is the shape this catches, and
        // an expression-bodied arrow that leaks its last value is the other —
        // fails HERE, before a cleanup is registered and before the plugin
        // can be counted as initialized.
        if (result !== undefined) {
          if (typeof result !== "function") throw new Error(ERR_PLUGIN_INIT_RETURN);
          this._pluginCleanups.push(result as () => void | Promise<void>);
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
        this._pluginInit = false;
        clearTimeout(timeoutId);
      }
    }

    if (this._localeDetector) {
      const detectedLocale = await this._localeDetector();
      if (detectedLocale && detectedLocale !== this._locale) {
        await this.setLocaleAsync(detectedLocale);
      }
    }
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
   * @internal `_missHook` hook — runs at the exact position of the base
   * class's former callback loop: every callback always runs (plugins track
   * missing keys through side effects) and the first defined result wins.
   * `params.fallback` still outranks it and `onMissingKey` from the options
   * still runs last — both stay base-side.
   */
  protected _missHook(
    key: string,
    locale: string,
    namespace: string,
  ): TranslationResult | undefined {
    let fallbackValue: TranslationResult | undefined;
    for (const callback of this._missingKeyCallbacks) {
      const result = callback(key, locale, namespace);
      if (fallbackValue === undefined) {
        fallbackValue = result as TranslationResult | undefined;
      }
    }
    return fallbackValue;
  }

  /**
   * Register a post-processor function
   * Post-processors are chained in the order they are registered (FIFO)
   * @param fn - The post-processor function to register
   */
  public registerPostProcessor(fn: PostProcessFn): void {
    if (typeof fn !== "function") {
      throw new Error(
        IS_DEV
          ? `[i18n] registerPostProcessor(): argument must be a function. Received: ${typeof fn}`
          : "E_REGISTER_POST_PROCESSOR",
      );
    }
    this._postProcessors.push(fn);
  }

  /**
   * Store plugin-specific data on the i18n instance.
   * This allows plugins to store configuration that persists with the instance.
   */
  public setPluginData(key: string, data: unknown): void {
    this._pluginData[key] = data;
  }

  /**
   * Retrieve plugin-specific data from the i18n instance.
   */
  public getPluginData<T = unknown>(key: string): T | undefined {
    return this._pluginData[key] as T | undefined;
  }
}

/**
 * Add the plugin-host capability to a base host.
 *
 * ```ts
 * const i18n = attachPlugins(attachLoader(createI18n({ locale: "en" })));
 * i18n.use(myPlugin);
 * ```
 *
 * MUST run BEFORE `init()`. `attachPlugins` installs the queue and `init()`
 * drains it exactly once, so composing the host afterwards leaves a host whose
 * `use()` can never take effect — it warns in dev and does nothing in prod.
 *
 * Attach `attachLoader` TOO if any hosted plugin registers a loader — in
 * either order, since both only have to be in place by `init()`, which is when
 * plugins run. When it has NOT run at all, this installs — IN DEVELOPMENT
 * ONLY — a throwing stand-in for
 * every `I18nLoaderApi` member (B4), so a plugin that reaches for
 * `registerLoader` on a plugins-only host fails with
 * {@link missingCapability}`("loader")`, the actionable error every wrapper
 * throws. **Dev-only shims; production throws a bare `TypeError` on a
 * plugins-only host — compose `loader()` as well.** Both builds still throw; only
 * the guidance is a development affordance, and it is not worth ~190 B min+gz
 * in every shipped bundle.
 *
 * The stand-ins are branded, so `hasLoaderApi` reports the capability as
 * absent in dev exactly as it does in prod (where there is no shim to reject),
 * and they carry the same non-enumerable/writable/configurable descriptors the
 * real members do, so a later `attachLoader` overwrites them cleanly (its own
 * `_loadNs` idempotency probe is untouched: only PUBLIC members are shimmed).
 *
 * Idempotent (dot-access probe on an installed hook — never `in`, never a
 * string key: see the mangling contract above). The members land as
 * non-enumerable own properties with class-method descriptors, so
 * `Object.keys(i18n)` and spread copies are unaffected.
 */
export function attachPlugins<T extends I18nBase<any>>(i18n: T): T & I18nPluginHostApi {
  const i = i18n as unknown as I18nInternal;
  if (i._beforeInit === undefined) {
    const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(
      I18nWithPlugins.prototype,
    );

    // B4, DEV ONLY: stand in for the loader API this host promises its plugins
    // but does not have. `_loadNs` is `attachLoader`'s OWN idempotency probe —
    // the same dot access, so the two can never disagree about whether the
    // capability is installed (and `hasLoaderApi` would be a second, heavier
    // answer to a question this module can already ask). ONE shim serves every
    // member: they all report the same absence. Folded into `api` rather than
    // defined separately, so the stand-ins land in the same call, with the same
    // non-enumerable/writable/configurable descriptor the real members carry —
    // which is what lets a later `attachLoader` overwrite them cleanly.
    //
    // The `IS_DEV` guard comes FIRST so terser drops the block, the member list
    // and the shim factory from a production build: this buys guidance for a
    // plugin author at development time, and the ~190 B min+gz it costs on
    // every plugin-host graph is not worth spending on the shipped bundle of
    // an app whose plugins already work.
    if (IS_DEV && i._loadNs === undefined) {
      const shim: PropertyDescriptor = {
        value: capabilityShim("loader"),
        writable: true,
        enumerable: false,
        configurable: true,
      };
      for (const name of LOADER_MEMBERS) api[name] = shim;
    }

    Object.defineProperties(i, api);
    i._initPlugins!();

    if (IS_DEV && i18n.isInitialized) warnLateCompose(i18n, ERR_LATE_PLUGINS);
  }
  return i18n as T & I18nPluginHostApi;
}

/** @internal Structural view of the transient flag, for the guard below. */
interface PluginInitProbe {
  _pluginInit?: boolean;
}

/**
 * The FIRST ensure-step of a lowercase plugin-package installer
 * (`fetchLoader`, `localeDetector`, `inContextEditor`) — the plugins-only
 * nested-use guard.
 *
 * ```ts
 * export function fetchLoader(options: FetchLoaderOptions) {
 *   return (i18n) => {
 *     const host = attachPlugins(attachLoader(ensureInstallable(i18n, "fetchLoader")));
 *     host.use(FetchLoader(options));
 *     return host;
 *   };
 * }
 * ```
 *
 * An installer is a function of the host, and so is a plugin — nothing brands
 * them apart, and `.with` stays a dumb pipe. `.use(fetchLoader(…))` is
 * therefore a type error that would otherwise RUN: the queued "plugin" is the
 * installer, and `init()` would hand it the host and let it attach
 * capabilities and queue a second plugin from inside the drain loop.
 *
 * This throws instead, at the innermost expression of the installer — before
 * `attachLoader`/`attachPlugins`, before `use`, before any lifecycle state
 * moves — so a rejected install leaves the host exactly as it was. The failure
 * then travels the plugin lifecycle's own error path (`onError`,
 * `reportError`, and a rethrow when the entry is required).
 *
 * Outside plugin initialization this returns the host untouched, which is why
 * it is safe as the first line of every installer and costs one property read
 * on the valid `.with` path.
 */
export function ensureInstallable<T>(i18n: T, installer: string): T {
  if ((i18n as unknown as PluginInitProbe)._pluginInit) {
    throw new Error(
      IS_DEV
        ? `[i18n] ${installer}() is a .with(…) installer, not a plugin, and it ran during plugin initialization — it was registered with .use(${installer}(…)). Compose it instead: createI18n(…).with(${installer}(…)). Nothing was installed.`
        : "E_INSTALLER_NESTED_USE",
    );
  }
  return i18n;
}
