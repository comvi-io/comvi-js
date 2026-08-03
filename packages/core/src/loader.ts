// @comvi/core/loader — async translation loading for the slim entry.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core/slim";
// import { loader } from "@comvi/core/loader";
//
// const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
// await i18n.init();
// ```
//
// `loader(importMap?)` is the CONFIGURED installer: it attaches the capability
// and, when handed an import map, registers it — one call instead of
// `attachLoader(…)` plus a separate `registerLoader`. `attachLoader` stays as
// the low-level API and is itself a valid installer (`.with(attachLoader)`),
// which is what you want when the loader is a plain function you register
// yourself.
//
// Attach BEFORE running plugins that register a loader (`attachPlugins` from
// `@comvi/core/plugins` hosts them). The root `@comvi/core` entry ships this
// capability on the class itself — `.with(loader())` there is a no-op, and
// `.with(loader(map))` still configures it.
//
// `flattenCatalog` is exported here too — it is a PURE function, so importing
// only it from this subpath pulls the flattener and nothing else. It is the
// escape hatch for a bare-slim host that hands nested catalogs straight to
// `addTranslations`; hosts with the loader attached (and the root entry) get
// the same flattening automatically.
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
 * statically, so referencing it pulls that adapter into the graph whether or
 * not you pass a map (+111 B min+gz measured on `fw-next-server-slim-loader`,
 * +124 B on the composed `slim-loader` graph). Bare `loader()` is therefore
 * attach-only but NOT free: for a plain `LoaderFn`, compose
 * `.with(attachLoader)` and register it yourself — 2 B over calling
 * `attachLoader(i18n)` directly, and no adapter.
 *
 * Attaching is idempotent: on a host that already has the capability (a
 * second `.with(loader())`, or any root `@comvi/core` instance) nothing is
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
