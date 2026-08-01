import type { DefaultTranslationParams, I18nOptions } from "../types";
import { I18n as I18nBase, type LoaderFn } from "./i18n";
import { createImportMapLoader, type LoaderImportMap } from "./importMapLoader";
import { icuCompiler } from "./translate/compile-icu";

/**
 * Full-featured `I18n` with the ICU message compiler wired in — the class
 * the root entry exports. Kept as a subclass (instead of a factory closure)
 * so `new I18n(options)` keeps its 0.4.0 single-argument signature.
 */
export class I18n<D extends DefaultTranslationParams = {}> extends I18nBase<D> {
  constructor(options: I18nOptions<D>) {
    super(options, icuCompiler);
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

/**
 * Create an i18n instance (full entry: ICU plurals/selects + tag syntax
 * registered by the root module).
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18n<D> {
  return new I18n<D>(options);
}
