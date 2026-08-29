import type { LoaderFn, LoaderResult } from "./i18n";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export type LoaderImportResult = LoaderResult | { default: LoaderResult };
export type LoaderImportMap = Record<string, () => Promise<LoaderImportResult>>;

/**
 * The presence of a `default` key decides, matching how dynamic `import()`
 * wraps JSON/ESM translation modules.
 */
function hasDefaultExport(result: LoaderImportResult): result is { default: LoaderResult } {
  return "default" in result;
}

/**
 * Adapt a static map of import functions to a `LoaderFn`.
 *
 * Keys without `:` are expanded to `"locale:defaultNs"`; the `{ default: … }`
 * wrapper from dynamic `import()` is unwrapped automatically.
 *
 * The composite's `registerLoader` accepts an import map directly; base
 * consumers wrap explicitly so the adapter stays out of graphs that never use
 * it: `i18n.registerLoader(createImportMapLoader(map, () => "default"))`.
 */
export function createImportMapLoader(
  importMap: LoaderImportMap,
  getDefaultNs: () => string,
): LoaderFn {
  return async (locale, namespace) => {
    const defaultNs = getDefaultNs();
    const key = `${locale}:${namespace}`;
    const importFn = importMap[key] ?? (namespace === defaultNs ? importMap[locale] : undefined);
    if (!importFn) {
      throw new Error(
        IS_DEV ? `[i18n] registerLoader: no entry for "${key}"` : "E_REGISTER_LOADER_ENTRY",
      );
    }
    const result = await importFn();
    return hasDefaultExport(result) ? result.default : result;
  };
}
