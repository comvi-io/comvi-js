// Async translation-loading capability — the implementation half of
// `@comvi/core/loader`.
//
// ONE implementation, TWO install surfaces (plan M-1): the capability is a
// class body, `I18nWithLoader`.
//   • root — `core/full.ts` extends it, so the members are ordinary inherited
//            prototype methods (no install glue in the root bundle at all);
//   • slim — `attachLoader(i18n)` copies that prototype's own descriptors
//            onto the instance. Class-body methods are already
//            non-enumerable / writable / configurable, so the two surfaces
//            are reflectively identical (`tests/root-contract.test.ts`).
// Descriptor copying (rather than prototype chaining) is what keeps
// capabilities composable: `attachPlugins(attachLoader(i18n))` needs no
// combinatorial Loader+Plugins class.
//
// MANGLING CONTRACT (plan R2): the `_`-prefixed members below are renamed by
// the single shared terser nameCache (`vite.shared.ts#mangleInternalProps`),
// which is only consistent because every core entry — including this one — is
// built by ONE vite invocation (`coreEntries`). Method definitions and dot
// access are what terser can correlate: never install or read a `_` member
// through a string (`i["_loader"]`, `Object.defineProperty(o, "_loadNs", …)`),
// because terser does not rewrite string arguments and the prod dist would
// break silently. `tests/dist/slim-composition.dist.test.ts` is the canary.
import type {
  DefaultTranslationParams,
  FlattenedTranslations,
  I18nLoaderApi,
  LoaderFn,
  TranslationValue,
} from "../types";
import { I18n as I18nBase, type I18nInternal } from "./i18n";
import { normalizeTranslationObject } from "../utils";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const ERR_NO_LOADER_REGISTERED = IS_DEV
  ? "[i18n] No loader registered. Cannot reload translations."
  : "E_NO_LOADER_REGISTERED";
const ERR_FAILED_RELOAD_TRANSLATIONS = IS_DEV
  ? "[i18n] Failed to reload translations"
  : "E_FAILED_RELOAD_TRANSLATIONS";
const ERR_REGISTER_LOADER_ARG = IS_DEV
  ? "[i18n] registerLoader(): argument must be a loader function. (Import maps: use the root entry, or wrap with createImportMapLoader from @comvi/core/loader.)"
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
 * The loader capability. Not exported from any entry point: the root entry
 * exposes it by extending this class (its constructor calls `_initLoader`),
 * the slim entry by `attachLoader`.
 *
 * Members are accessed through `this` exactly as they were when they lived in
 * the base class — `this.x` is the single most repeated token in the bundle,
 * and aliasing it to a local (`const i = this as I18nInternal`) shrinks the
 * minified size but measurably WORSENS the gzipped size (+90 B on the full
 * entry, measured). Hence `protected declare` re-declarations below and
 * `protected` state on the base rather than per-access casts.
 */
export class I18nWithLoader<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  /** Loader-owned state; created by `_initLoader`, never by a field initializer. */
  declare protected _loader?: LoaderFn;
  declare protected _pendingLoads: Record<string, Promise<void> | undefined>;
  declare protected _nsGeneration: number;
  /** Locale-switch race arbitration — only meaningful while a load can be in flight. */
  declare protected _currentLocaleChangeId: number;
  declare protected _requestedLocale: string;

  /**
   * Initialize loader-owned state. Called by the root constructor and by
   * `attachLoader`; this class declares no constructor of its own.
   */
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
   * A PROTOTYPE method, not an `_initLoader` assignment: the root entry
   * merges `options.translation` inside `super()`, long before any `_init*`
   * call, and only a prototype member exists that early. `attachLoader`'s
   * descriptor copy picks it up for a slim host, and `attachNestedCatalogs`
   * installs just this one member for a host that wants nested catalogs
   * without the rest of the loader.
   */
  protected _flattenNs(catalog: Record<string, TranslationValue>): FlattenedTranslations {
    return normalizeTranslationObject(catalog);
  }

  /**
   * Destroy phase 3: the reset runs only after the `destroyed` listeners have
   * observed the still-live state (two-phase destroy contract).
   */
  protected _resetLoader(): void {
    this._nsGeneration++;
    this._pendingLoads = {};
    this._loader = undefined;
  }

  /**
   * Locale switching WITH a loader in the graph: the base transition wrapped
   * in the race machinery a bare instance can never need.
   *
   * Three things happen here and nowhere else (framework-slim P1 seam):
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

    // Track this request to handle race conditions when locale changes rapidly
    this._requestedLocale = value;
    const changeId = ++this._currentLocaleChangeId;

    this._setLoadingState(true);

    try {
      // Load any active namespaces that aren't loaded for the new locale FIRST.
      // The `_loader` probe (not `_loadNs`) keeps byte-parity with 0.4.x: with
      // no loader registered the old code awaited NOTHING, so
      // `i18n.locale = "fr"` applied synchronously. Probing the hook would add
      // a microtask tick.
      if (this._loader && this._activeNamespaces.size > 0) {
        await this._loadNs(value, [...this._activeNamespaces], true);
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
   * The root entry's `I18n` additionally accepts a static import map; slim
   * consumers wrap one with `createImportMapLoader`.
   */
  public registerLoader(loader: LoaderFn): void {
    if (typeof loader !== "function") {
      throw new Error(ERR_REGISTER_LOADER_ARG);
    }
    this._loader = loader;
  }

  /** Get the registered loader function */
  public getLoader(): LoaderFn | undefined {
    return this._loader;
  }

  /**
   * Activate a namespace and load it for the current locale.
   *
   * Namespace ACTIVATION only matters when something loads namespaces, so it
   * lives with the loader (contingency C1). A bare slim instance activates
   * implicitly: `addTranslations` self-activates every namespace it carries.
   */
  public async addActiveNamespace(namespace: string): Promise<void> {
    return this.addActiveNamespaces([namespace]);
  }

  /** Activate several namespaces and load them for the current locale. */
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
   * Register a callback for load errors (contingency C2 — a `loadError`
   * event can only be emitted by the loader capability).
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
        // Cancel any in-flight load so reload fetches fresh data instead of
        // resolving to a request that started before the cache was cleared
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
 * Add the async-loading capability to a slim instance.
 *
 * ```ts
 * const i18n = attachLoader(createI18n({ locale: "en" }));
 * i18n.registerLoader(async (locale, ns) => (await fetch(`/${locale}/${ns}.json`)).json());
 * ```
 *
 * Idempotent (dot-access probe on an installed hook — never `in`, never a
 * string key: see the mangling contract above). The members land as
 * non-enumerable own properties with class-method descriptors, so
 * `Object.keys(i18n)` and spread copies are unaffected.
 */
export function attachLoader<T extends I18nBase<any>>(i18n: T): T & I18nLoaderApi {
  const i = i18n as unknown as I18nInternal;
  if (i._loadNs === undefined) {
    const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(
      I18nWithLoader.prototype,
    );
    Object.defineProperties(i, api);
    i._initLoader!();
  }
  return i18n as T & I18nLoaderApi;
}

/**
 * Flatten a nested catalog into the dot-notation shape a host stores.
 *
 * ```ts
 * import { createI18n } from "@comvi/core/slim";
 * import { flattenCatalog } from "@comvi/core/loader";
 *
 * i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) }); // -> "nav.home"
 * ```
 *
 * A bare `@comvi/core/slim` host stores catalogs as given, so it wants FLAT
 * keys (`{ "nav.home": "Home" }`) or `"locale:namespace"`-keyed flat objects.
 * `attachLoader` and the root `@comvi/core` entry flatten for you — a loader
 * returns raw JSON, so it is part of that job. This is the escape hatch for a
 * host that loads nothing and still has nested objects in hand; being a plain
 * function it also works on `options.translation`, which the constructor
 * merges before anything can be attached.
 *
 * Non-string leaves are coerced with `String()` and `null`/`undefined` leaves
 * are dropped (with a dev warning), exactly as on the loader path. Input with
 * a null prototype is assumed already flat and passes through.
 */
export { normalizeTranslationObject as flattenCatalog } from "../utils";
