// `@comvi/vue/slim` — the root-free entry (framework-slim abort P4-AB1).
//
// Why this exists, measured: `index.ts` carries `export * from "@comvi/core"`,
// and a STAR re-export is a name set a bundler can only resolve by keeping the
// source module. Production builds prune it (fw-vue-slim's module sentinels),
// but webpack's DEVELOPMENT mode has `usedExports` off, so an app on a bare
// slim host still got the whole root entry there — and with it core's ambient
// `registerTagSyntax()`, which makes `t("a <b>c</b> d")` render differently in
// dev than in prod. That dev/prod divergence is the exact failure class the
// plan bans (§2.4), so the pre-decided fallback ships: this entry names no
// root export at all, in either mode.
//
// It is a SUPERSET of `@comvi/vue`'s bindings, not a variant: same classes,
// same composables, same component, same injection key. What is missing is
// the ROOT-bound `createI18n`; the `createI18n` exported here builds the same
// `VueI18n` on a bare `@comvi/core/slim` host instead. Pick ONE entry per
// app — the two are separate build passes, so `I18N_INJECTION_KEY` is a
// different symbol in each and a provider from one is invisible to a
// composable from the other.
//
// The capability toolkit is re-exported here so a vue app never has to name
// `@comvi/core` at all. TWO RULES, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *` — that is the P4-AB1 lesson
//      above, restated. `export type *` is erased before any bundler sees it
//      and is therefore fine.
//   2. Re-export from core's PURE subpaths, never from `@comvi/core`, and
//      never through another wrapper: webpack development reconnects a single
//      `export … from` across one `sideEffects: false` package, but not a
//      two-package chain (fs-p5, `@comvi/next/client`).
//
// `@comvi/core/tags` is deliberately NOT re-exported: it is the one
// side-effectful subpath, so naming it here would put ambient tag
// registration in every graph. `<T>` owns that import and is pinned into its
// own dist chunk so an app that never renders it pays nothing.
export { VueI18n } from "./VueI18n";
export { createI18n } from "./createI18nSlim";
export type { VueSlimI18nOptions } from "./createI18nSlim";
export { createI18nFromCore } from "./createI18nFromCore";
// The host builder behind `createI18nFromCore`. `createI18n` is taken by the
// one-call preset, so core's own constructor keeps the name the vue surface
// already uses for the thing it returns: the core.
export { createI18n as createCore } from "@comvi/core/slim";
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
// under `sideEffects: false`, so the four an app does not call cost it zero.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, flattenCatalog } from "@comvi/core/loader";
export { attachPlugins } from "@comvi/core/plugins";
export { attachDevtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core/slim";
export type { DevtoolsOptions } from "@comvi/core/devtools";
