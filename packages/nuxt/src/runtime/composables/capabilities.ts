// Nuxt inherits @comvi/vue's capability composables verbatim: they resolve the
// host through the injection key the runtime plugin provides with
// `vueApp.use(i18n)`, and they carry vue's identity contract (one bag per host,
// module-level WeakMap) — so a nuxt component and a plain vue component under
// the same app get the same bound members.
//
// They are auto-imported by the module (src/module.ts `addImports`).
export { useI18nLoader, useI18nPlugins } from "@comvi/vue";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "@comvi/vue";
