// Plugin capability — the implementation half of `@comvi/core/plugins`.
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
  PluginI18nInstance,
  I18nPluginApi,
  PostProcessFn,
  TranslationParams,
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
  ? "[@comvi/core] registerLocaleDetector(): argument must be a function."
  : "E_REGISTER_LOCALE_DETECTOR";

/**
 * `init()` is the only thing that drains the plugin queue, so a plugin
 * registered after it has run does nothing until the NEXT `init()` — which is
 * almost never what the caller meant. Empty in prod so terser drops the
 * strings — and the WeakSet with them.
 */
const ERR_LATE_PLUGINS = IS_DEV
  ? "[@comvi/core] .use(plugins()) ran after init(): compose capabilities before init(). A plugin queued now does not run until the next init(), which re-runs the WHOLE queue and accumulates a second set of cleanups — so this i18n instance is unchanged. Create the i18n instance, compose it, then init()."
  : "";

const ERR_LATE_REGISTER_PLUGIN = IS_DEV
  ? "[@comvi/core] registerPlugin() was called after init(): register plugins before init(). This plugin has not run and will not run on its own; the next init() drains it together with every plugin already in the queue, and the cleanups of both drains accumulate."
  : "";

const ERR_PLUGIN_INIT_RETURN = IS_DEV
  ? "[@comvi/core] A plugin returned a value. A plugin may only return nothing (`undefined`) or a cleanup function, so nothing was registered. If this was a bare-name installer, compose it with `.use(installer(…))` — `registerPlugin()` runs it as a plugin and it hands the i18n instance back. If it was your own plugin, use a statement body: `(i18n) => { flag = true; }`."
  : "E_PLUGIN_INIT_RETURN";

const noop = (): void => {};
type Cleanup = () => void | Promise<void>;

/** @internal Registered plugin tuple; owned by the plugin capability. */
export type PluginEntry = [
  plugin: I18nPluginFn,
  required: boolean,
  timeout: number,
  onError?: (error: Error) => void,
];

/**
 * The plugin capability. Not exported from any entry point: the composite
 * installs it on its prototype, a base instance gets it via `attachPlugins`.
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
   * deliberately NOT created by `_initPlugins` — an instance that never ran `init()`
   * has no own property for it.
   */
  declare protected _pluginInit?: boolean;

  /**
   * The current `init()` attempt. `mark` is the cleanup-queue length when it
   * began: everything above it belongs to the attempt, and `_abortInit` runs
   * exactly that. `failed` tells a timed-out plugin that settles later that
   * its attempt is gone, so its cleanup must run at once.
   */
  declare protected _initRecord: { mark: number; failed?: boolean };

  /** Called by the composite's constructor and by `attachPlugins`; this class declares none of its own. */
  protected _initPlugins(): void {
    this._plugins = [];
    this._pluginCleanups = [];
    this._pluginData = Object.create(null);
    this._missingKeyCallbacks = new Set();
    // An init() rejected before the drain began (a destroyed instance) still
    // calls `_abortInit`; an empty record makes that a no-op.
    this._initRecord = { mark: 0 };
  }

  /**
   * Destroy phase 1 — awaited before any lifecycle reset or emit, so cleanups
   * observe live capability state. LIFO: a cleanup may depend on one queued
   * before it.
   *
   * Also the drain for a cleanup that arrives LATE: `_beforeInit` calls this
   * again when a plugin it was still awaiting returns its cleanup after this
   * phase has already run (see there). Draining twice is safe — the `pop()`
   * loop cannot hand the same cleanup out twice, and an empty queue is a no-op.
   *
   * BOUNDARY, by design: that late drain is awaited by `init()`, NOT by
   * `destroy()`. So `await i18n.destroy()` can resolve before the cleanup of a
   * plugin that was still initializing has finished — `destroy()` must not
   * hang on a slow plugin, and it does not wait for `init()`. Await the
   * `init()` promise too if a test or a request teardown needs both.
   */
  protected async _preDestroy(cleanups = this._pluginCleanups): Promise<void> {
    while (cleanups.length) {
      try {
        await cleanups.pop()!();
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
    // The base already cleared `_postProcessor`; drop the chain behind it, so a
    // re-registration after `destroy()` starts from the constructed state.
    this._postProcessors = undefined;
  }

  /**
   * Register a raw plugin (chainable) — the deferred queue, drained at `init()`.
   *
   * NOT a composition verb: `.use(installer)` composes, this queues. An app's
   * own inline plugin goes through the `definePlugin(fn)` installer, which is this
   * call in `.use` clothing.
   *
   * MUST be called BEFORE `init()`, which is the only thing that drains the
   * queue. A plugin registered afterwards therefore does not run now — that
   * warns in dev and is silent in prod. It is not discarded either: the next
   * `init()` drains the queue again, running it together with every plugin
   * already in there, and the cleanups of both drains accumulate until one
   * `destroy()` releases them all (pinned by
   * `tests/features/initialization.test.ts`). Registering from INSIDE a plugin
   * is fine: the current drain loop picks the new entry up.
   */
  public registerPlugin(plugin: I18nPluginFn, options?: PluginOptions): this {
    if (IS_DEV && this.isInitialized) warnLateCompose(this, ERR_LATE_REGISTER_PLUGIN);
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
   * detector goes through the public `setLocale` so namespaces load before
   * the locale applies.
   */
  protected async _beforeInit(): Promise<void> {
    const attempt: { mark: number; failed?: boolean } = (this._initRecord = {
      mark: this._pluginCleanups.length,
    });
    for (const [plugin, required, timeout, onError] of this._plugins) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      // The guard window is exactly one plugin invocation: `ensureInstallable`
      // reads this flag, and the locale detector below is not a plugin.
      this._pluginInit = true;
      try {
        // `PluginI18nInstance` is the `{}`-defaults instance surface: an instance
        // with constructor-guaranteed defaults narrows `setDefaultParams`,
        // which the interface's property-style declaration checks strictly.
        const run = plugin(this as unknown as PluginI18nInstance);
        // Only `undefined` and a cleanup function are legal. The two shapes
        // this catches are an installer handing the instance back and an
        // expression-bodied arrow leaking its last value; both fail before a
        // cleanup is registered or the plugin counts as initialized. A cleanup
        // whose attempt failed, or whose instance is gone, has nothing left to
        // drain it, so it is released at once instead of queued. A late
        // cleanup whose attempt was followed by a newer one goes BELOW that
        // attempt's mark, so the newer attempt's rollback cannot release it.
        const own = (result: unknown) => {
          if (result !== undefined) {
            if (typeof result !== "function") throw new Error(ERR_PLUGIN_INIT_RETURN);
            if (this._isDestroyed || attempt.failed) return this._preDestroy([result as Cleanup]);
            const current = this._initRecord;
            if (current === attempt) this._pluginCleanups.push(result as Cleanup);
            else this._pluginCleanups.splice(current.mark++, 0, result as Cleanup);
          }
        };
        await own(
          await Promise.race([
            run,
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(
                  new Error(
                    IS_DEV
                      ? `[@comvi/core] Plugin initialization timed out after ${timeout}ms`
                      : "E_PLUGIN_INIT_TIMEOUT",
                  ),
                );
                // The timeout bounds init latency, not the plugin: it keeps
                // running, so what it returns later is still owned. Its late
                // rejection was already reported as this timeout.
                Promise.resolve(run)
                  .then(own, noop)
                  .catch((error: Error) =>
                    this.reportError(error, {
                      source: "plugin",
                      pluginName: plugin.name || "anonymous",
                    }),
                  );
              }, timeout);
            }),
          ]),
        );
      } catch (error) {
        // Failing after destroy() is the quiet end `init()` promises: no
        // report, no `onError`, and no further plugin starts.
        if (this._isDestroyed) return;
        const err =
          error instanceof Error
            ? error
            : new Error(
                IS_DEV
                  ? `[@comvi/core] Plugin initialization failed: ${String(error)}`
                  : "E_PLUGIN_INIT_FAILED",
              );

        if (onError) {
          try {
            onError(err);
          } catch (handlerError) {
            if (IS_DEV) {
              warn(`[@comvi/core] Plugin error handler failed: ${(handlerError as Error).message}`);
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

      // `destroy()` landed while THIS plugin was running. Two things follow,
      // and the loop bottom is the one place both are true: every interleaving
      // point in this method is an await inside the iteration above, so a
      // check here catches every one of them.
      //
      //  • A cleanup this plugin just returned was pushed AFTER destroy phase 1
      //    drained the queue, and phase 3's `_resetPlugins()` throws the array
      //    away — so it would never run and never report. Drain it here, which
      //    reuses phase 1's own reporting (`plugin-cleanup`) verbatim.
      //  • No further plugin may START. A plugin whose `plugin(instance)` call had
      //    not begun when destroy landed does not run at all, and the locale
      //    detector below does not run either.
      if (this._isDestroyed) return this._preDestroy();
    }

    if (this._localeDetector) {
      const detectedLocale = await this._localeDetector();
      // Re-checked after the detector's await for the same reason.
      if (!this._isDestroyed && detectedLocale && detectedLocale !== this._locale) {
        await this.setLocale(detectedLocale);
      }
    }
  }

  /**
   * @internal `_abortInit` hook — `init()` failed, so run only the cleanups
   * this attempt registered, LIFO, through the destroy drain's reporting.
   * Cleanups from an earlier successful `init()` stay queued for `destroy()`.
   */
  protected _abortInit(): Promise<void> {
    const attempt = this._initRecord;
    attempt.failed = true;
    return this._preDestroy(this._pluginCleanups.splice(attempt.mark));
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

  /**
   * The CHAIN — array and loop both live here, so a base instance that only ever
   * got the `postProcess` constructor option carries neither. Created on the
   * first registration, never by `_initPlugins`: a composed instance that
   * registers nothing keeps `_postProcessor` empty, which is what arms the
   * paramless fast path in `tRaw()`.
   */
  declare protected _postProcessors?: PostProcessFn[];

  /** Post-processors are chained in registration order (FIFO). */
  public registerPostProcessor(fn: PostProcessFn): void {
    if (typeof fn !== "function") {
      throw new Error(
        IS_DEV
          ? `[@comvi/core] registerPostProcessor(): argument must be a function. Received: ${typeof fn}`
          : "E_REGISTER_POST_PROCESSOR",
      );
    }
    if (this._postProcessors === undefined) {
      // Seed with the constructor option, if there was one — it is the head of
      // the chain — then take the base's single slot over with the applier
      // below. `_chainPostProcess` is stored UNBOUND on purpose: the base calls
      // it as `this._postProcessor(...)`, so the receiver is this instance.
      this._postProcessors = this._postProcessor ? [this._postProcessor] : [];
      this._postProcessor = this._chainPostProcess;
    }
    this._postProcessors.push(fn);
  }

  /**
   * Chain every registered processor over one result. Catches PER processor:
   * a throw is reported and leaves the accumulator untouched, so the
   * processors after it still run — which is why this never throws, and the
   * base's own `try` around it never fires.
   */
  private _chainPostProcess(
    result: TranslationResult,
    key: string,
    namespace: string,
    params: TranslationParams,
  ): TranslationResult {
    const processors = this._postProcessors!;
    let acc = result;
    for (let i = 0; i < processors.length; i++) {
      try {
        acc = processors[i](acc, key, namespace, params);
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "post-processor",
          key,
          namespace,
        });
      }
    }
    return acc;
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
 * Add the plugin capability to a base instance.
 *
 * MUST run BEFORE `init()`, which is where the plugin queue is drained — an instance
 * composed afterwards has a `registerPlugin()` whose plugins sit in the queue
 * until the next `init()`.
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
export function attachPlugins<T extends I18nBase<any>>(i18n: T): T & I18nPluginApi {
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
  return i18n as T & I18nPluginApi;
}

/** @internal Structural view of the transient flag, for the guard below. */
interface PluginInitProbe {
  _pluginInit?: boolean;
}

/**
 * The FIRST ensure-step of a plugin-package installer — the
 * plugins-only installer-as-plugin guard.
 *
 * An installer is a function of the instance, and so is a plugin: nothing brands
 * them apart, so `registerPlugin(fetchLoader(…))` is a type error that would
 * otherwise RUN, letting the installer attach capabilities and queue a second
 * plugin from inside the drain loop. This throws instead, at the installer's
 * innermost expression — before anything is attached — so a rejected install
 * leaves the instance exactly as it was.
 *
 * Outside plugin initialization it returns the instance untouched, which is what
 * makes it safe as the first line of every installer.
 */
export function ensureInstallable<T>(i18n: T, installer: string): T {
  if ((i18n as unknown as PluginInitProbe)._pluginInit) {
    throw new Error(
      IS_DEV
        ? `[@comvi/core] ${installer}() is a .use installer, not a plugin, and it ran during plugin initialization — it was registered with registerPlugin(${installer}(…)) or definePlugin(${installer}(…)). Compose it instead: createI18n(…).use(${installer}(…)). Nothing was installed.`
        : "E_INSTALLER_AS_PLUGIN",
    );
  }
  return i18n;
}
