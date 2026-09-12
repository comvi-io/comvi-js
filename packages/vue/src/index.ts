// TWO RULES this file exists to keep:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is how THIS
//      file's own `export * from "@comvi/core"` once kept the whole core root
//      entry alive in webpack dev. `export type *` is erased before any
//      bundler sees it and is therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain. So every core binding below comes
//      straight from `@comvi/core` or one of its pure subpaths, never relayed
//      through another `@comvi/*`.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph.

// Vue is the one binding whose preset is a REAL function — there is a `VueI18n`
// to build around the host, and `ssrLocale` has to reach the core before the
// reactive ref is seeded — so `createI18n` here is vue's own factory, not a
// rename of core's. Capabilities are composed on its result with
// `.use(installer)`, which runs on `i18n.core` and retypes it.
//
// `createI18nFromCore` wraps a host built somewhere other than next to the app
// (nuxt's `hostModule`, or one host shared with non-Vue code). That host is
// built with `createI18n` from `@comvi/core` directly — it is elsewhere by
// definition, so crossing the import boundary is more honest than a local
// alias, and no `createCore` is re-exported here. `I18n` is a TYPE from this
// root, the class VALUE is `@comvi/core`'s.
export { VueI18n } from "./VueI18n";
export { createI18n } from "./createI18n";
export { createI18nFromCore } from "./createI18nFromCore";
export type { I18n } from "@comvi/core";

export { useI18n } from "./composables/useI18n";
export type { UseI18nReturn } from "./composables/useI18n";
export { useI18nLoader, useI18nPlugins } from "./composables/capabilities";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./composables/capabilities";
export { T } from "./components/T";
export type { ComponentMap } from "./components/T";
export { I18N_INJECTION_KEY } from "./keys";
export type {
  VueI18n as I18nInstance,
  VueI18nOptions,
  VueI18nCoreOptions,
  AnyVueI18n,
  UseHostIdentityError,
} from "./VueI18n";

// The capability toolkit. Each is a named binding under `sideEffects: false`,
// so the subpaths an app never calls stay out of its graph. `loader(map)` /
// `plugins()` / `devtools()` are the configured installers for `i18n.use(…)`
// (and for `host.use(…)`, one level down); the `attach*` functions are
// themselves installers, so `.use(attachLoader)` works too.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { attachPlugins, definePlugin, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
