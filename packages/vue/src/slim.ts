// `@comvi/vue/slim` — the star-free entry (framework-slim abort P4-AB1).
//
// Why this exists, measured: `index.ts` carries `export * from "@comvi/core"`,
// and a STAR re-export is a name set a bundler can only resolve by keeping the
// source module. Production builds prune it (fw-vue-slim's module sentinels),
// but webpack's DEVELOPMENT mode has `usedExports` off, so an app on a bare
// host still got the WHOLE root entry there. Back when that root was the
// composed, tag-registering one, that also meant core's ambient
// `registerTagSyntax()` came along and `t("a <b>c</b> d")` rendered
// differently in dev than in prod — the exact dev/prod divergence the plan
// bans (§2.4), so the pre-decided fallback shipped: this entry star-re-exports
// nothing, in either mode. The converged root is the pure base host, so that
// ambient hazard is gone; the unpruned bytes are not, which is why the rule
// stands.
//
// It is a SUPERSET of `@comvi/vue`'s bindings, not a variant: same classes,
// same composables, same component, same injection key — and, since the
// single-entry convergence, the same base `@comvi/core` core out of either
// `createI18n`. What differs is the EXPORT SURFACE: no `export *`, and the
// capability toolkit carried here. Pick ONE entry per app — the two are
// separate build passes, so `I18N_INJECTION_KEY` is a different symbol in each
// and a provider from one is invisible to a composable from the other.
//
// The capability toolkit is re-exported here so a vue app never has to name
// `@comvi/core` at all. TWO RULES, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *` — that is the P4-AB1 lesson
//      above, restated. `export type *` is erased before any bundler sees it
//      and is therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain (fs-p5, `@comvi/next/client`).
//      So every core binding below comes straight from `@comvi/core` or one
//      of its pure subpaths, never relayed through `@comvi/vue`.
//
// `@comvi/core/tags` is deliberately NOT re-exported: it is the one
// side-effectful subpath, so naming it here would put ambient tag
// registration in every graph. `<T>` owns that import and is pinned into its
// own dist chunk so an app that never renders it pays nothing.
//
// THE ONE-EXPRESSION QUICKSTART — this is the shape to reach for:
//
// ```ts
// import { createI18n, icuCompiler, loader } from "@comvi/vue/slim";
//
// const i18n = createI18n({ locale: "en", compiler: icuCompiler })
//   .with(loader({ uk: () => import("./uk.json") }));
// ```
//
// `.with(installer)` is core's composition pipe (it is just `installer(i18n)`),
// and `loader()` / `plugins()` / `devtools()` below are the configured
// installers it takes.
//
// Vue's `createI18n` is the wrapper preset; `createCore` is core's own
// constructor, and both accept `.with(…)` on the host they produce.

export { VueI18n } from "./VueI18n";
export { createI18n } from "./createI18nSlim";
export type { VueSlimI18nOptions } from "./createI18nSlim";
export { createI18nFromCore } from "./createI18nFromCore";
// The host builder behind `createI18nFromCore`. `createI18n` is taken by the
// one-call preset, so core's own constructor keeps the name the vue surface
// already uses for the thing it returns: the core. It is the PURE BASE root's
// constructor, and naming it here is deliberate — the base host module is
// meant to be reachable from this entry. What stays out is `index.ts`'s
// `export * from "@comvi/core"` and `@comvi/core/tags`.
export { createI18n as createCore } from "@comvi/core";
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
// `i18n.with(…)`: one expression composes and configures a capability. The
// `attach*` functions stay as the low-level API — and are themselves valid
// installers, so `.with(attachLoader)` works too.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
