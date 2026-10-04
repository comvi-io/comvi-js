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
// `acquireLoaderApi(host)` is the COMPONENT-side half of the same subpath: the
// one implementation behind `useI18nLoader()` in all four bindings. It lives
// here rather than on the `@comvi/core` root because a graph that never
// acquires the capability must not pay for it — the root is the base floor.
//
// `flattenCatalog` is NOT here: every host flattens nested catalogs itself, so
// the flattener is no longer this capability's escape hatch. It stays published
// from the `@comvi/core` root, for pre-flattening data by hand.
import type { I18n } from "./core/i18n";
import type { I18nLoaderApi, WrapperI18nHost } from "./types";
import { attachLoader } from "./core/loader";
import { createImportMapLoader, type LoaderImportMap } from "./core/importMapLoader";
import { hasLoaderApi, missingCapability } from "./utils/capability";

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

/**
 * The `@comvi/core/loader` surface a COMPONENT may drive: the three members
 * that left a binding's `useI18n()` in 0.5, plus their activation siblings —
 * `addActiveNamespaces` and the `removeActiveNamespace(s)` pair that
 * deactivates.
 *
 * Registration-time APIs (`registerLoader`, `getLoader`) are deliberately
 * absent — wiring belongs where the instance is constructed, not in a
 * component.
 *
 * Re-exported by `@comvi/react`, `@comvi/vue`, `@comvi/solid` and
 * `@comvi/svelte` as `UseI18nLoaderReturn`: it is the return of their
 * `useI18nLoader()`, which is {@link acquireLoaderApi} over the host in
 * context.
 */
export interface AcquiredLoaderApi {
  /** Activate a namespace and load it for the current locale. */
  addActiveNamespace: I18nLoaderApi["addActiveNamespace"];
  /** Activate several namespaces and load them for the current locale. */
  addActiveNamespaces: I18nLoaderApi["addActiveNamespaces"];
  /** Deactivate a namespace and cancel its pending loads; content is untouched. */
  removeActiveNamespace: I18nLoaderApi["removeActiveNamespace"];
  /** Deactivate several namespaces and cancel their pending loads. */
  removeActiveNamespaces: I18nLoaderApi["removeActiveNamespaces"];
  /** Force reload translations from the registered loader. */
  reloadMessages: I18nLoaderApi["reloadMessages"];
  /** Subscribe to load failures. Returns an unsubscribe function. */
  onLoadError: I18nLoaderApi["onLoadError"];
}

/**
 * Identity contract: ONE bag per host, cached here rather than in a
 * framework-local memo, so two components under one provider receive the same
 * function references.
 *
 * Annotated pure so a graph that never acquires the capability does not pay
 * for the map: `acquireLoaderApi` is the only reader, and dropping the
 * function has to drop this with it.
 */
const loaderBags = /* @__PURE__ */ new WeakMap<WrapperI18nHost, AcquiredLoaderApi>();

/**
 * Acquire the loader capability of `host`, or throw
 * {@link missingCapability | missingCapability("loader")}.
 *
 * ONE implementation, four bindings: `useI18nLoader()` in `@comvi/react`,
 * `@comvi/vue`, `@comvi/solid` and `@comvi/svelte` is this call over the host
 * each of them reads from context, and nothing else. The four used to carry a
 * byte-identical copy pinned by a text-diff gate, which is how one of them
 * once drifted.
 *
 * The check is STRUCTURAL and it throws in dev AND in prod: there is no silent
 * no-op and no dev-only tombstone. A base `@comvi/core` instance is every host
 * nobody composed a loader onto, so compose it where the instance is created —
 * `createI18n(...).use(attachLoader)` or `.use(loader(map))`.
 *
 * @example
 * ```ts
 * const { addActiveNamespace } = acquireLoaderApi(host);
 * await addActiveNamespace("dashboard");
 * ```
 */
export function acquireLoaderApi(host: WrapperI18nHost): AcquiredLoaderApi {
  // A cached bag implies the capability was already verified for this host:
  // attach is monotonic, capabilities are added and never removed.
  const cached = loaderBags.get(host);
  if (cached) return cached;

  if (!hasLoaderApi(host)) throw missingCapability("loader");

  const bag: AcquiredLoaderApi = {
    addActiveNamespace: host.addActiveNamespace.bind(host),
    addActiveNamespaces: host.addActiveNamespaces.bind(host),
    removeActiveNamespace: host.removeActiveNamespace.bind(host),
    removeActiveNamespaces: host.removeActiveNamespaces.bind(host),
    reloadMessages: host.reloadMessages.bind(host),
    onLoadError: host.onLoadError.bind(host),
  };
  loaderBags.set(host, bag);
  return bag;
}
