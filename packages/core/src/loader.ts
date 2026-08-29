// @comvi/core/loader — async translation loading, composed onto the base host.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { loader } from "@comvi/core/loader";
//
// const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
// await i18n.init();
// ```
//
// `loader(importMap?)` attaches the capability and, when handed an import map,
// registers it. `attachLoader` is the low-level API and is itself a valid
// installer (`.with(attachLoader)`) — what you want when the loader is a plain
// function you register yourself.
//
// The ORDER of `loader()`, `plugins()` and `devtools()` among themselves is
// free: plugins run at `init()`, by which point every capability composed
// before `init()` is attached. The library's one ordering rule is `icu()`'s —
// it must run before the first catalog reaches the host, and COMPOSING a loader
// is not ingestion.
//
// `flattenCatalog` is exported here too and is PURE, so importing only it from
// this subpath pulls the flattener and nothing else.
import type { I18n } from "./core/i18n";
import type { I18nLoaderApi } from "./types";
import { attachLoader } from "./core/loader";
import { createImportMapLoader, type LoaderImportMap } from "./core/importMapLoader";

export { attachLoader, flattenCatalog } from "./core/loader";
export { createImportMapLoader } from "./core/importMapLoader";
export type { LoaderImportMap, LoaderImportResult } from "./core/importMapLoader";
export type { I18nLoaderApi, LoaderFn, LoaderResult } from "./types";

/**
 * The loader capability as a configured `.with(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
 * ```
 *
 * With an import map: attach + `registerLoader(createImportMapLoader(map))`,
 * where the default namespace is read live off the host, so
 * `setDefaultNamespace()` after composition still applies.
 *
 * PICK THE INSTALLER BY WHAT YOU HAVE. `loader` names the import-map adapter
 * statically, so merely referencing it pulls that adapter into your graph
 * whether or not you pass a map — bare `loader()` is attach-only but NOT free.
 * For a plain `LoaderFn`, compose `.with(attachLoader)` and register it
 * yourself; no adapter is pulled in.
 *
 * Attaching is idempotent: on a host that already has the capability nothing is
 * installed and no own property shadows the inherited prototype member. A map
 * is still registered in that case — configuration is not installation.
 */
export function loader(
  importMap?: LoaderImportMap,
): <T extends I18n<any>>(i18n: T) => T & I18nLoaderApi {
  return (i18n) => {
    const host = attachLoader(i18n);
    if (importMap) {
      host.registerLoader(createImportMapLoader(importMap, () => host.getDefaultNamespace()));
    }
    return host;
  };
}
