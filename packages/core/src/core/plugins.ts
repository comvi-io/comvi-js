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

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const ERR_REGISTER_LOCALE_DETECTOR = IS_DEV
  ? "[i18n] registerLocaleDetector(): argument must be a function."
  : "E_REGISTER_LOCALE_DETECTOR";

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
    while (this._pluginCleanups.length > 0) {
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
   * @param plugin - The plugin to register
   * @param options - Plugin options (required, timeout, onError)
   * @returns this for chaining
   */
  public use(plugin: I18nPluginFn, options?: PluginOptions): this {
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
      try {
        const result = await Promise.race([
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
      if (fallbackValue === undefined && result !== undefined) {
        fallbackValue = result;
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
 * Own descriptors of the capability prototype — already carrying the mangled
 * runtime names, which is what makes both install surfaces mangling-safe by
 * construction. `constructor` is excluded: installing it would repoint
 * `instance.constructor` at the capability class.
 *
 * @internal Shared by `attachPlugins` and the composite install in `core/full.ts`.
 */
const { constructor: _ctor, ...pluginApi } = Object.getOwnPropertyDescriptors(
  I18nWithPlugins.prototype,
);
export { pluginApi };

/**
 * Add the plugin-host capability to a base host.
 *
 * ```ts
 * const i18n = attachPlugins(attachLoader(createI18n({ locale: "en" })));
 * i18n.use(myPlugin);
 * ```
 *
 * Attach `attachLoader` FIRST if any hosted plugin registers a loader.
 *
 * Idempotent (dot-access probe on an installed hook — never `in`, never a
 * string key: see the mangling contract above). The members land as
 * non-enumerable own properties with class-method descriptors, so
 * `Object.keys(i18n)` and spread copies are unaffected.
 */
export function attachPlugins<T extends I18nBase<any>>(i18n: T): T & I18nPluginHostApi {
  const i = i18n as unknown as I18nInternal;
  if (i._beforeInit === undefined) {
    Object.defineProperties(i, pluginApi);
    i._initPlugins!();
  }
  return i18n as T & I18nPluginHostApi;
}
