// Async translation-loading capability — the implementation half of
// `@comvi/core/loader`.
//
// ONE implementation, TWO install surfaces: the capability is a class body,
// `I18nWithLoader`. `core/full.ts` extends it, so the composite gets ordinary
// inherited prototype methods and needs no install glue; `attachLoader(i18n)`
// copies that prototype's own descriptors onto a base instance. Class-body
// methods are already non-enumerable / writable / configurable, so the two
// surfaces are reflectively identical. Descriptor copying rather than
// prototype chaining is what keeps capabilities composable:
// `attachPlugins(attachLoader(i18n))` needs no combinatorial class.
//
// MANGLING CONTRACT: the `_`-prefixed members below are renamed by the single
// shared terser nameCache (`vite.shared.ts#mangleInternalProps`), which is only
// consistent because every core entry is built by ONE vite invocation
// (`coreEntries`). Terser can only correlate method definitions and dot access:
// never install or read a `_` member through a string (`i["_loader"]`,
// `Object.defineProperty(o, "_loadNs", …)`) — terser does not rewrite string
// arguments and the prod dist would break silently.
import type {
  DefaultTranslationParams,
  FlattenedTranslations,
  I18nLoaderApi,
  LoaderFn,
  TranslationValue,
} from "../types";
import { I18n as I18nBase, type I18nInternal } from "./i18n";
import { normalizeTranslationObject } from "../utils";
import { warnLateCompose } from "../utils/lateCompose";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * `init()` loads the initial namespaces once. A loader composed after it is
 * never asked for them, so the host looks composed and stays empty until
 * something else (`addActiveNamespace`, `reloadTranslations`, a locale switch)
 * happens to trigger a load. Empty in prod so terser drops the string.
 */
const ERR_LATE_LOADER = IS_DEV
  ? "[i18n] .with(loader()) ran after init(): compose capabilities before init(). init() has already loaded the initial namespaces and will not re-run for this loader — call reloadTranslations() or addActiveNamespace() to load now."
  : "";

const ERR_NO_LOADER_REGISTERED = IS_DEV
  ? "[i18n] No loader registered. Cannot reload translations."
  : "E_NO_LOADER_REGISTERED";
const ERR_FAILED_RELOAD_TRANSLATIONS = IS_DEV
  ? "[i18n] Failed to reload translations"
  : "E_FAILED_RELOAD_TRANSLATIONS";
const ERR_REGISTER_LOADER_ARG = IS_DEV
  ? "[i18n] registerLoader(): argument must be a loader function. For a static import map use .with(loader(map)), or wrap it with createImportMapLoader(map, () => i18n.getDefaultNamespace()) — both from @comvi/core/loader."
  : "E_REGISTER_LOADER_ARG";

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

/**
 * The loader capability. Not exported from any entry point: the composite
 * (`core/full.ts`) extends this class, any other host gets it from
 * `attachLoader` / `.with(loader())`.
 *
 * Members are reached through `this`, never through a local alias: `this.x` is
 * the most repeated token in the bundle, and aliasing it (`const i = this as
 * I18nInternal`) shrinks the minified size but WORSENS the gzipped size by
 * ~90 B. Hence the `protected declare` re-declarations below and `protected`
 * state on the base rather than per-access casts.
 */
export class I18nWithLoader<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  /** Loader-owned state; created by `_initLoader`, never by a field initializer. */
  declare protected _loader?: LoaderFn;
  declare protected _pendingLoads: Record<string, Promise<void> | undefined>;
  declare protected _nsGeneration: number;
  /** Locale-switch race arbitration — only meaningful while a load can be in flight. */
  declare protected _currentLocaleChangeId: number;
  declare protected _requestedLocale: string;

  /** Called by the composite's constructor and by `attachLoader`; this class declares none of its own. */
  protected _initLoader(): void {
    this._pendingLoads = Object.create(null);
    this._nsGeneration = 0;
    this._currentLocaleChangeId = 0;
    this._requestedLocale = this._locale;
  }

  /**
   * @internal `_flattenNs` hook — nested-catalog flattening for
   * `addTranslations` and `options.translation`.
   *
   * A PROTOTYPE method, not an `_initLoader` assignment: the composite
   * merges `options.translation` inside `super()`, long before any `_init*`
   * call, and only a prototype member exists that early. `attachLoader`'s
   * descriptor copy picks it up for a base host, and `attachNestedCatalogs`
   * installs just this one member for a host that wants nested catalogs
   * without the rest of the loader.
   */
  protected _flattenNs(catalog: Record<string, TranslationValue>): FlattenedTranslations {
    return normalizeTranslationObject(catalog);
  }

  /** Destroy phase 3 — runs only after the `destroyed` listeners saw the still-live state. */
  protected _resetLoader(): void {
    this._nsGeneration++;
    this._pendingLoads = {};
    this._loader = undefined;
  }

  /**
   * Locale switching WITH a loader in the graph: the base transition wrapped
   * in the race machinery a bare instance can never need.
   *
   * Three things happen here and nowhere else:
   *  • active namespaces are loaded for the target locale BEFORE it applies,
   *    so the UI never flashes untranslated;
   *  • a `changeId` suppresses both the result and the error of a request
   *    that a newer one superseded, including the "revert to the current
   *    locale mid-flight" cancellation (the early-exit bump below);
   *  • the loading refcount brackets the whole attempt.
   *
   * The base emits `localeChanged` synchronously and emits no loading
   * transition at all; this override is what makes a locale switch an
   * observable loading operation.
   */
  public override async setLocaleAsync(value: string): Promise<void> {
    // The early exit must compare against the LAST REQUESTED locale, not the
    // applied one: reverting to the current locale while another change is in
    // flight has to cancel that change (the bump invalidates its changeId).
    if (this._locale === value) {
      if (this._requestedLocale !== value) {
        this._requestedLocale = value;
        this._currentLocaleChangeId++;
      }
      return;
    }

    this._requestedLocale = value;
    const changeId = ++this._currentLocaleChangeId;

    this._setLoadingState(true);

    try {
      // Load the active namespaces BEFORE the locale applies, so the UI never
      // flashes untranslated. Probe `_loader`, not `_loadNs`: with no loader
      // registered nothing must be awaited, or `i18n.locale = "fr"` would stop
      // applying synchronously (one extra microtask tick).
      if (this._loader && this._activeNamespaces.size > 0) {
        await this._loadNs(value, [...this._activeNamespaces], true);
      }

      // Staleness must be re-checked after EVERY await.
      if (changeId !== this._currentLocaleChangeId) {
        return;
      }

      const oldLocale = this._locale;
      this._locale = value;
      this._emit("localeChanged", { from: oldLocale, to: value });
    } catch (error) {
      // A superseded request must not surface its error either — only the
      // latest request's outcome is observable.
      if (changeId !== this._currentLocaleChangeId) {
        return;
      }
      throw error;
    } finally {
      // Unconditional, to match the unconditional increment above.
      this._setLoadingState(false);
    }
  }

  /**
   * Register a translation loader function.
   *
   * @example Function loader
   * ```typescript
   * i18n.registerLoader(async (locale, namespace) => {
   *   const res = await fetch(`/locales/${locale}/${namespace}.json`);
   *   return res.json();
   * });
   * ```
   *
   * The internal composite's `I18n` additionally accepts a static import map; base
   * consumers wrap one with `createImportMapLoader`.
   */
  public registerLoader(loader: LoaderFn): void {
    if (typeof loader !== "function") {
      throw new Error(ERR_REGISTER_LOADER_ARG);
    }
    this._loader = loader;
  }

  public getLoader(): LoaderFn | undefined {
    return this._loader;
  }

  /**
   * Activate a namespace and load it for the current locale.
   *
   * Namespace ACTIVATION only matters when something loads namespaces, so it
   * lives with the loader. A base host activates implicitly: `addTranslations`
   * self-activates every namespace it carries.
   */
  public async addActiveNamespace(namespace: string): Promise<void> {
    return this.addActiveNamespaces([namespace]);
  }

  public async addActiveNamespaces(namespaces: string[]): Promise<void> {
    this._setLoadingState(true);
    try {
      await this._nsAddActiveNamespaces(namespaces);
    } finally {
      this._setLoadingState(false);
    }
    this._emit("configChanged", { source: "namespaceActivated" });
  }

  /**
   * Register a callback for load errors. Lives here because only the loader
   * capability can emit `loadError`.
   * @returns Cleanup function that removes the callback.
   */
  public onLoadError(
    callback: (locale: string, namespace: string, error: Error) => void,
  ): () => void {
    return this.on("loadError", ({ locale, namespace, error }) =>
      callback(locale, namespace, error),
    );
  }

  /**
   * Reload translations from the remote loader.
   * Clears the current cache and attempts to fetch fresh translations.
   *
   * @param locale - Optional locale to reload (defaults to current + fallbacks)
   * @param namespace - Optional namespace to reload (defaults to all active)
   * @throws {Error} Throws if all reload attempts fail, indicating the cache may be empty.
   */
  public async reloadTranslations(locale?: string, namespace?: string): Promise<void> {
    if (!this._loader) {
      throw new Error(ERR_NO_LOADER_REGISTERED);
    }

    const localesToReload = locale ? [locale] : [this._locale, ...this._fallbackLocales];
    const namespacesToReload = namespace ? [namespace] : [...this._activeNamespaces];

    for (const loc of localesToReload) {
      for (const ns of namespacesToReload) {
        // Otherwise the reload could resolve to a request that started before
        // the cache was cleared.
        this._cancelNs(loc, ns);
        this.translationCache.delete(loc, ns);
      }
    }

    const failures: Array<{ loc: string; reason: unknown }> = [];
    await Promise.all(
      localesToReload.map((loc) =>
        this._loadNs(loc, namespacesToReload, false).catch((reason) => {
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

  /** @internal One guarded, de-duplicated namespace fetch. */
  protected _loadOne(locale: string, namespace: string): Promise<void> {
    const key = `${locale}:${namespace}`;
    const existing = this._pendingLoads[key];
    if (existing) {
      return existing;
    }

    const generation = this._nsGeneration;
    const loader = this._loader!;

    // A load is cancelled when its _pendingLoads entry is removed (clear/reload)
    // or the generation is bumped (destroy). Cancelled loads must neither write
    // to the cache nor surface their errors. The closure only reads `guarded`
    // after the first await, when the assignment below has already run.
    let guarded!: Promise<void>;
    // eslint-disable-next-line prefer-const -- self-reference needs declare-then-assign
    guarded = (async () => {
      try {
        const translations = await loader(locale, namespace);
        if (generation !== this._nsGeneration || this._pendingLoads[key] !== guarded) return;
        // Lock immediately before the direct cache merge.
        this._compilerLocked = true;
        // The preflight normalizes its own copy so the production statement
        // below stays byte-identical to the shipped one.
        if (IS_DEV)
          (this as unknown as I18nInternal)._preflightSimpleCatalog?.(
            normalizeTranslationObject(translations),
          );
        this.translationCache.set(locale, namespace, normalizeTranslationObject(translations));
        this._emit("namespaceLoaded", { namespace, locale });
      } catch (error) {
        if (generation !== this._nsGeneration || this._pendingLoads[key] !== guarded) return;
        this._emit("loadError", { locale, namespace, error: error as Error });
        throw error;
      } finally {
        if (this._pendingLoads[key] === guarded) {
          delete this._pendingLoads[key];
        }
      }
    })();

    this._pendingLoads[key] = guarded;
    return guarded;
  }

  /** @internal `_loadNs` hook — load the given namespaces for one locale. */
  protected async _loadNs(
    locale: string,
    namespaces: string[],
    skipLoaded: boolean,
  ): Promise<void> {
    if (!this._loader) return;

    const namespacesToLoad = skipLoaded
      ? namespaces.filter((ns) => !this.translationCache.has(locale, ns))
      : namespaces;

    if (namespacesToLoad.length === 0) return;

    const failedNamespacesList: string[] = [];
    await Promise.all(
      namespacesToLoad.map((ns) =>
        this._loadOne(locale, ns).catch(() => {
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

  /** @internal `_cancelNs` hook — drop pending loads matching the scope (undefined = any). */
  protected _cancelNs(locale?: string, namespace?: string): void {
    for (const key in this._pendingLoads) {
      const colonIdx = key.indexOf(":");
      const loc = key.slice(0, colonIdx);
      const ns = key.slice(colonIdx + 1);
      if (
        (locale === undefined || loc === locale) &&
        (namespace === undefined || ns === namespace)
      ) {
        delete this._pendingLoads[key];
      }
    }
  }
}

/**
 * Add the async-loading capability to a base host.
 *
 * ```ts
 * const i18n = attachLoader(createI18n({ locale: "en" }));
 * i18n.registerLoader(async (locale, ns) => (await fetch(`/${locale}/${ns}.json`)).json());
 * ```
 *
 * MUST run BEFORE `init()`, which loads the initial namespaces exactly once.
 * A loader composed afterwards is never consulted for them; that warns in dev
 * and the recovery is an explicit `addActiveNamespace()` /
 * `reloadTranslations()`.
 *
 * Idempotent via a dot-access probe on an installed hook — never `in`, never a
 * string key (see the mangling contract above). The members land as
 * non-enumerable own properties, so `Object.keys(i18n)` and spread copies are
 * unaffected. They also overwrite the throwing stand-ins `attachPlugins`
 * installs on a plugins-only host, which is why the two attach orders end up
 * identical.
 */
export function attachLoader<T extends I18nBase<any>>(i18n: T): T & I18nLoaderApi {
  const i = i18n as unknown as I18nInternal;
  if (i._loadNs === undefined) {
    const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(
      I18nWithLoader.prototype,
    );
    Object.defineProperties(i, api);
    i._initLoader!();
    if (IS_DEV && i18n.isInitialized) warnLateCompose(i18n, ERR_LATE_LOADER);
  }
  return i18n as T & I18nLoaderApi;
}

/**
 * Flatten a nested catalog into the dot-notation shape a host stores.
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { flattenCatalog } from "@comvi/core/loader";
 *
 * i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) }); // -> "nav.home"
 * ```
 *
 * A base `@comvi/core` host stores catalogs as given, so it wants FLAT keys
 * (`{ "nav.home": "Home" }`) or `"locale:namespace"`-keyed flat objects.
 * Composing the loader flattens for you; this is the escape hatch for a host
 * that loads nothing and still has nested objects in hand. Being a plain
 * function it also works on `options.translation`, which the constructor merges
 * before anything can be attached.
 *
 * Non-string leaves are coerced with `String()` and `null`/`undefined` leaves
 * are dropped (with a dev warning), exactly as on the loader path. Input with
 * a null prototype is assumed already flat and passes through.
 */
export { normalizeTranslationObject as flattenCatalog } from "../utils";
