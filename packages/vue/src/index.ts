// `@comvi/vue` — THE entry. One package specifier for a whole vue app: the
// host constructors, the bindings, and the capability toolkit.
//
// There is no second entry and no second build pass. A framework user never
// has to name `@comvi/core` — which is the point: one specifier is the whole
// DX story. And because the package has exactly ONE chunk graph, it has
// exactly ONE `I18N_INJECTION_KEY` symbol: the "a plugin installed from one
// entry and a `useI18n()` from the other cannot see each other" hazard that
// the second subpath build used to create is gone by construction, not by
// documentation.
//
// TWO RULES this file exists to keep, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is exactly how
//      THIS file's own `export * from "@comvi/core"` kept the whole core root
//      entry alive in webpack dev, back when that root was the composed,
//      tag-registering one (fs-p4 §2 / abort P4-AB1). The star is gone with
//      the subpath that was created to escape it: the rule outlived the graph
//      it was measured on, because a star re-export still pins every module it
//      names. `export type *` is erased before any bundler sees it and is
//      therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain (fs-p5, `@comvi/next/client`).
//      So every core binding below comes straight from `@comvi/core` or one
//      of its pure subpaths, never relayed through another `@comvi/*`.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph. `<T>` renders rich text through the
// PURE `@comvi/core/rich-text` seam, which passes the tag grammar per call, and
// lives in its own dist chunk so an app that never renders it pays nothing.
// Turning tag syntax on for plain string-API `t()` stays the app's own call.

// THE ONE-EXPRESSION QUICKSTART — this is the shape to reach for:
//
// ```ts
// import { createI18n, icuCompiler } from "@comvi/vue";
//
// const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });
// createApp(App).use(i18n).mount("#app");
// ```
//
// `.with(installer)` is core's composition pipe (it is just `installer(i18n)`),
// and `loader()` / `plugins()` / `devtools()` below are the configured
// installers it takes. Vue's host lives one level down — the preset returns a
// `VueI18n`, so the pipe goes on `i18n.core`, or on a host you build yourself
// with `createCore` and hand to `createI18nFromCore`. ICU is the one capability
// with TWO shapes, both named here: an inline constructor catalog takes the
// COMPILER in the same call (`compiler: icuCompiler`), and a remote catalog
// takes the INSTALLER, `.with(icu())`, which must run BEFORE anything is
// ingested — the host locks its compiler on the first catalog and `icu()` then
// throws `E_COMPILER_LOCKED`. Neither shape makes an app name `@comvi/core/icu`.

// The wrapper class and its three construction paths. Vue is the one binding
// whose preset is a REAL function — there is a `VueI18n` to build around the
// host, and `ssrLocale` has to reach the core before the reactive ref is
// seeded — so `createI18n` here is vue's own factory, not a rename of core's.
// That is why core's constructor keeps a name of its own: `createCore`.
export { VueI18n } from "./VueI18n";
export { createI18n } from "./createI18n";
export { createI18nFromCore } from "./createI18nFromCore";
// The host builder behind `createI18nFromCore`, and the class behind it.
// `createI18n` is taken by the one-call preset, so core's own constructor keeps
// the name the vue surface already uses for the thing it returns: the core.
// Both are the PURE BASE root's, re-exported by name.
export { createI18n as createCore, I18n } from "@comvi/core";

// The vue bindings.
export { useI18n } from "./composables/useI18n";
export type { UseI18nReturn } from "./composables/useI18n";
export { useI18nLoader, useI18nPlugins } from "./composables/capabilities";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./composables/capabilities";
export { T } from "./components/T";
export { I18N_INJECTION_KEY } from "./keys";
export type {
  VueI18n as I18nInstance,
  VueI18nOptions,
  VueI18nCoreOptions,
  AnyVueI18n,
} from "./VueI18n";

// The capability toolkit, from core's pure subpaths. Each is a named binding
// under `sideEffects: false`, so the ones an app does not call cost it zero.
//
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `host.with(…)`: one expression composes and configures a capability. The
// `attach*` functions stay as the low-level API — and are themselves valid
// installers, so `.with(attachLoader)` works too.
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
