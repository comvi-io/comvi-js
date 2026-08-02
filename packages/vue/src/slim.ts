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
// It is a SUBSET of `@comvi/vue`, not a variant: same classes, same
// composables, same component, same injection key. What is missing is the
// root-bound `createI18n` and the core re-export — build your host with
// `@comvi/core/slim` and hand it to `createI18nFromCore`.
export { VueI18n } from "./VueI18n";
export { createI18nFromCore } from "./createI18nFromCore";
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
