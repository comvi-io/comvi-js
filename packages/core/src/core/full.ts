import type { DefaultTranslationParams, I18nOptions, I18nPluginHostApi, LoaderFn } from "../types";
import type { I18nInternal } from "./i18n";
import { I18nWithLoader } from "./loader";
import { pluginApi } from "./plugins";
import { devtoolsApi } from "./devtools";
import { createImportMapLoader, type LoaderImportMap } from "./importMapLoader";
import { icuCompiler } from "./translate/compile-icu";

/**
 * Full-featured `I18n` with the ICU message compiler wired in — the class
 * the root entry exports. Kept as a subclass (instead of a factory closure)
 * so `new I18n(options)` keeps its 0.4.0 single-argument signature.
 *
 * Every capability the `@comvi/core/loader`, `@comvi/core/plugins` and
 * `@comvi/core/devtools` subpaths attach to a slim instance is inherited
 * here from the same implementation, so the root surface is unchanged from
 * 0.4.0. The loader arrives through `extends`; the plugin host — which must
 * NOT extend the loader capability, or a slim+plugins-only graph would drag
 * the loader in — and the discovery capability arrive as prototype
 * descriptors installed just below.
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
    // PUBLIC field (`instanceId`), and the root reflective contract pins it
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
   * Keys without `:` are expanded to `"locale:defaultNs"`.
   * The `{ default: ... }` wrapper from dynamic `import()` is unwrapped automatically.
   */
  public override registerLoader(loader: LoaderFn | LoaderImportMap): void {
    if (typeof loader === "object" && loader !== null) {
      super.registerLoader(createImportMapLoader(loader, () => this.getDefaultNamespace()));
      return;
    }
    super.registerLoader(loader);
  }
}

// Second and third capabilities, same implementations, prototype-level
// install: the keys are the already-mangled runtime names, so this is
// mangling-safe by construction (plan R2) and the members stay
// non-enumerable prototype members — the root reflective contract (A11) is
// unchanged.
Object.defineProperties(I18n.prototype, pluginApi);
Object.defineProperties(I18n.prototype, devtoolsApi);

/**
 * Create an i18n instance (full entry: ICU plurals/selects + tag syntax
 * registered by the root module).
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18n<D> {
  return new I18n<D>(options);
}
