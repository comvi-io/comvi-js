// @comvi/core/plugins — the plugin host for the slim entry.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core/slim";
// import { attachLoader } from "@comvi/core/loader";
// import { attachPlugins } from "@comvi/core/plugins";
//
// const i18n = attachPlugins(attachLoader(createI18n({ locale: "en" })));
// i18n.use(myPlugin);
// await i18n.init();
// ```
//
// Attach `attachLoader` BEFORE `attachPlugins` when any hosted plugin
// registers a loader — plugins run at `init()`, and `registerLoader` has to
// exist by then. The root `@comvi/core` entry ships this capability on the
// class itself — nothing to attach there.
export { attachPlugins } from "./core/plugins";
export type { I18nPluginHostApi, I18nPluginHost } from "./types";
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
