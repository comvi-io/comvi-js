// @comvi/core/loader — async translation loading, composed onto the base host.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { loader } from "@comvi/core/loader";
//
// const i18n = createI18n({ locale: "en" }).use(loader({ uk: () => import("./uk.json") }));
// await i18n.init();
// ```
//
// TWO INSTALLERS, ONE SENTENCE: a static import map goes to `loader(map)`; a
// plain `LoaderFn` goes to `.use(attachLoader)` and then `registerLoader(fn)`.
// The map is REQUIRED, so `loader` is never the attach-only installer and
// `attachLoader` is never the configured one.
//
// The ORDER of `loader(map)`, `plugins()` and `devtools()` among themselves is
// free: plugins run at `init()`, by which point every capability composed
// before `init()` is attached. There is no other ordering rule: ICU is the
// constructor option `compiler: icuCompiler`, not an installer.
//
// `flattenCatalog` is NOT here: every host flattens nested catalogs itself, so
// the flattener is no longer this capability's escape hatch. It stays published
// from the `@comvi/core` root, for pre-flattening data by hand.
import type { I18n } from "./core/i18n";
import type { I18nLoaderApi } from "./types";
import { attachLoader } from "./core/loader";
import { createImportMapLoader, type LoaderImportMap } from "./core/importMapLoader";

export { attachLoader } from "./core/loader";
export { createImportMapLoader } from "./core/importMapLoader";
export type { LoaderImportMap, LoaderImportResult } from "./core/importMapLoader";
export type { I18nLoaderApi, LoaderFn, LoaderResult } from "./types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * The map is a required parameter, so TypeScript rejects a bare `loader()`
 * before it runs. A JS caller reaches this instead, and it names BOTH forms —
 * the mistake is not "you forgot an argument", it is "you wanted the other
 * installer". Dev text; production keeps the bare code, in the same
 * `E_*_LOADER_*` family as the capability's own diagnostics.
 */
const ERR_LOADER_IMPORT_MAP = IS_DEV
  ? "[i18n] loader(importMap) requires the import map. A static map of import functions goes here: .use(loader({ uk: () => import('./uk.json') })). A plain loader FUNCTION goes to .use(attachLoader) followed by i18n.registerLoader(fn) — both from @comvi/core/loader."
  : "E_LOADER_IMPORT_MAP";

/**
 * The loader capability as a CONFIGURED `.use(…)` installer: attach +
 * `registerLoader(createImportMapLoader(map))`, where the default namespace is
 * read live off the host, so `setDefaultNamespace()` after composition still
 * applies.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(loader({ uk: () => import("./uk.json") }));
 * ```
 *
 * The import map is REQUIRED, which is the whole decision rule: this installer
 * names the import-map adapter statically, so it is the one to reach for when
 * you have a map, and `.use(attachLoader)` is the one to reach for when you
 * have a `LoaderFn` — attach-only, adapter-free, and then
 * `i18n.registerLoader(fn)`.
 *
 * Attaching is idempotent: on a host that already has the capability nothing is
 * installed and no own property shadows the inherited prototype member. The map
 * is still registered in that case — configuration is not installation.
 */
export function loader(
  importMap: LoaderImportMap,
): <T extends I18n<any>>(i18n: T) => T & I18nLoaderApi {
  if (importMap == null) throw new Error(ERR_LOADER_IMPORT_MAP);
  return (i18n) => {
    const host = attachLoader(i18n);
    host.registerLoader(createImportMapLoader(importMap, () => host.getDefaultNamespace()));
    return host;
  };
}
