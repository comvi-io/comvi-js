import type { DefaultTranslationParams, I18nOptions, I18nPluginHostApi, LoaderFn } from "../types";
import type { I18nInternal } from "./i18n";
import { I18nWithLoader } from "./loader";
import { I18nWithPlugins } from "./plugins";
import { I18nWithDevtools } from "./devtools";
import { createImportMapLoader, type LoaderImportMap } from "./importMapLoader";
import { icuCompiler } from "./translate/compile-icu";

/**
 * Full-featured `I18n` with the ICU message compiler wired in — the class the
 * CDN global publishes and `@comvi/next`'s builder mirrors. A subclass rather
 * than a factory closure, so `new I18n(options)` keeps its single-argument
 * signature. This is the compatibility host, NOT the ESM root (that is the base
 * host in `src/index.ts`).
 *
 * The loader arrives through `extends`; the plugin host — which must NOT extend
 * the loader capability, or a base+plugins-only graph would drag the loader in
 * — and the discovery capability arrive as prototype descriptors installed just
 * below.
 */
/*
 * Declaration merging is the point, not an accident: the plugin members are
 * genuinely installed on `I18n.prototype` at module scope (below), and
 * merging is the only way to keep `use()`'s `this` return polymorphic — an
 * indexed-access or property-style redeclaration would pin it to the
 * capability class and break `i18n.use(p).registerLoader(...)`. `D` is
 * unused here but must stay: TS requires identical type parameters on every
 * declaration of a merged name.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
export interface I18n<D extends DefaultTranslationParams = {}> extends I18nPluginHostApi {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see above
export class I18n<D extends DefaultTranslationParams = {}> extends I18nWithLoader<D> {
  constructor(options: I18nOptions<D>) {
    super(options, icuCompiler);
    this._initLoader();
    const self = this as unknown as I18nInternal;
    self._initPlugins!();
    // LAST, deliberately: discovery is the only capability that assigns a
    // PUBLIC field (`instanceId`), and the composed reflective contract pins it
    // as the final public own property in assignment order.
    self._initDevtools!(options.instanceId, options.exposeGlobal);
  }

  /**
   * Register a translation loader.
   *
   * Accepts either a loader function or a static map of import functions:
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
   * Keys without `:` are expanded to `"locale:defaultNs"`, and the
   * `{ default: … }` wrapper from a dynamic `import()` is unwrapped.
   */
  public override registerLoader(loader: LoaderFn | LoaderImportMap): void {
    if (typeof loader === "object" && loader !== null) {
      super.registerLoader(createImportMapLoader(loader, () => this.getDefaultNamespace()));
      return;
    }
    super.registerLoader(loader);
  }
}

// Snapshot each capability class exactly as the low-level attach functions do:
// the keys are the already-mangled runtime names, so the install stays
// mangling-safe and the members stay non-enumerable.
for (const capability of [I18nWithPlugins, I18nWithDevtools]) {
  const { constructor: _ctor, ...api } = Object.getOwnPropertyDescriptors(capability.prototype);
  Object.defineProperties(I18n.prototype, api);
}

/**
 * Create a fully composed instance: ICU plurals/selects, the loader, the
 * plugin host and discovery. Tag syntax is registered by whichever entry pulls
 * this in (`src/umd.ts` does; the ESM root does not).
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18n<D> {
  return new I18n<D>(options);
}
