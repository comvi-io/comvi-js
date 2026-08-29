// Plugin-host capability — the implementation half of `@comvi/core/plugins`.
//
// ONE implementation, TWO install surfaces, exactly as `core/loader.ts`:
// `core/full.ts` copies this prototype's own descriptors onto `I18n.prototype`
// at module scope, and `attachPlugins(i18n)` copies the same descriptors onto a
// base instance. This class must NOT extend `I18nWithLoader` — the composite
// already spends its one `extends` slot on the loader capability, and extending
// it here would drag the loader into a base+plugins-only module graph.
//
// MANGLING CONTRACT: the `_`-prefixed members below are renamed by the single
// shared terser nameCache (`vite.shared.ts#mangleInternalProps`), which is only
// consistent because every core entry is built by ONE vite invocation
// (`coreEntries`). Terser can only correlate method definitions and dot access:
// never install or read a `_` member through a string.
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
 * The plugin queue is drained inside `init()` and never again, so a plugin
 * registered afterwards silently never runs. Empty in prod so terser drops the
 * strings — and the WeakSet with them.
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
 * installs it on its prototype, a base host gets it via `attachPlugins`.
 *
 * Members are reached through `this`, never through a local alias: aliasing
 * shrinks the minified size but WORSENS the gzipped size, so `protected
 * declare` re-declarations are used instead of per-access casts.
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
   * stack. It is the whole state behind `ensureInstallable` below, and it is
   * deliberately NOT created by `_initPlugins` — a host that never ran `init()`
   * has no own property for it.
   */
  declare protected _pluginInit?: boolean;

  /** Called by the composite's constructor and by `attachPlugins`; this class declares none of its own. */
  protected _initPlugins(): void {
    this._plugins = [];
    this._pluginCleanups = [];
    this._pluginData = Object.create(null);
    this._missingKeyCallbacks = new Set();
  }

  /**
   * Destroy phase 1 — awaited before any lifecycle reset or emit, so cleanups
   * observe live capability state. LIFO: a cleanup may depend on one queued
   * before it.
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
   * Destroy phase 3 — runs only after the `destroyed` listeners saw the
   * still-live state. Re-running the initializer restores exactly the
   * constructed state: a fresh `_missingKeyCallbacks` is indistinguishable from
   * a cleared one, since the disposer `onMissingKey` returns reads the field
   * off `this`.
   */
  protected _resetPlugins(): void {
    this._initPlugins();
    this._localeDetector = undefined;
  }

  /**
   * Register a plugin (chainable).
   *
   * MUST be called BEFORE `init()`. The queue is drained once, inside `init()`,
   * and re-running it is not supported (a plugin's cleanup and the lifecycle
   * events around it assume a single drain), so a plugin registered afterwards
   * never runs — that warns in dev and is a no-op in prod. Registering from
   * INSIDE a plugin is fine: the drain loop picks the new entry up.
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
   * @internal `_beforeInit` hook. Plugins first, detector second, and the
   * detector goes through the public `setLocaleAsync` so namespaces load before
   * the locale applies.
   */
  protected async _beforeInit(): Promise<void> {
    for (const [plugin, required, timeout, onError] of this._plugins) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      // The guard window is exactly one plugin invocation: `ensureInstallable`
      // reads this flag, and the locale detector below is not a plugin.
      this._pluginInit = true;
      try {
        const result: unknown = await Promise.race([
          // `I18nPluginHost` is the `{}`-defaults host surface: an instance
          // with constructor-guaranteed defaults narrows `setDefaultParams`,
          // which the interface's property-style declaration checks strictly.
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
        // Only `undefined` and a cleanup function are legal. The two shapes
        // this catches are an installer handing the host back and an
        // expression-bodied arrow leaking its last value; both fail HERE,
        // before a cleanup is registered or the plugin counts as initialized.
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

  /** Register a locale detector; `init()` consults it after the plugins have run. */
  public registerLocaleDetector(detector: () => string | Promise<string>): void {
    if (typeof detector !== "function") {
      throw new Error(ERR_REGISTER_LOCALE_DETECTOR);
    }
    this._localeDetector = detector;
  }

  public getLanguageDetector(): (() => string | Promise<string>) | undefined {
    return this._localeDetector;
  }

  /**
   * Register a callback for missing keys; it may return a value to use as the
   * fallback.
   * @returns Cleanup function that removes the callback.
   */
  public onMissingKey(
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ): () => void {
    this._missingKeyCallbacks.add(callback);
    return () => void this._missingKeyCallbacks.delete(callback);
  }

  /**
   * @internal `_missHook` hook. Every callback always runs — plugins track
   * missing keys through side effects — and the first defined result wins.
   * `params.fallback` outranks it; the `onMissingKey` option runs last.
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

  /** Post-processors are chained in registration order (FIFO). */
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

  /** Store plugin-specific data that persists for the life of the instance. */
  public setPluginData(key: string, data: unknown): void {
    this._pluginData[key] = data;
  }

  public getPluginData<T = unknown>(key: string): T | undefined {
    return this._pluginData[key] as T | undefined;
  }
}

/**
 * Add the plugin-host capability to a base host.
 *
 * MUST run BEFORE `init()`, which drains the plugin queue exactly once — a host
 * composed afterwards has a `use()` that can never take effect.
 *
 * Attach `attachLoader` TOO if any hosted plugin registers a loader, in either
 * order. Without it, this installs — IN DEVELOPMENT ONLY — a branded throwing
 * stand-in for every `I18nLoaderApi` member, so a plugin reaching for
 * `registerLoader` fails with {@link missingCapability}`("loader")` rather than
 * a bare `TypeError`. The brand is what keeps `hasLoaderApi` answering the same
 * in both builds, and the stand-ins carry the real members' descriptors so a
 * later `attachLoader` overwrites them cleanly.
 *
 * Idempotent via a dot-access probe on an installed hook — never `in`, never a
 * string key (see the mangling contract above).
 */
export function attachPlugins<T extends I18nBase<any>>(i18n: T): T & I18nPluginHostApi {
  const i = i18n as unknown as I18nInternal;
  if (i._beforeInit === undefined) {
    const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(
      I18nWithPlugins.prototype,
    );

    // The probe is `_loadNs` — `attachLoader`'s OWN idempotency probe, so the
    // two can never disagree about whether the capability is installed. The
    // `IS_DEV` guard comes FIRST so terser drops the block, the member list and
    // the shim factory from a production build.
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
 * The FIRST ensure-step of a lowercase plugin-package installer — the
 * plugins-only nested-use guard.
 *
 * An installer is a function of the host, and so is a plugin: nothing brands
 * them apart, so `.use(fetchLoader(…))` is a type error that would otherwise
 * RUN, letting the installer attach capabilities and queue a second plugin from
 * inside the drain loop. This throws instead, at the installer's innermost
 * expression — before anything is attached — so a rejected install leaves the
 * host exactly as it was.
 *
 * Outside plugin initialization it returns the host untouched, which is what
 * makes it safe as the first line of every installer.
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
