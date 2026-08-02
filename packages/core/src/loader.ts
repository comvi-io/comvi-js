// @comvi/core/loader — async translation loading for the slim entry.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core/slim";
// import { attachLoader } from "@comvi/core/loader";
//
// const i18n = attachLoader(createI18n({ locale: "en" }));
// i18n.registerLoader(async (locale, ns) => (await fetch(`/${locale}/${ns}.json`)).json());
// await i18n.init();
// ```
//
// Attach BEFORE running plugins that register a loader (`attachPlugins` from
// `@comvi/core/plugins` hosts them). The root `@comvi/core` entry ships this
// capability on the class itself — nothing to attach there.
export { attachLoader } from "./core/loader";
export { createImportMapLoader } from "./core/importMapLoader";
export type { LoaderImportMap, LoaderImportResult } from "./core/importMapLoader";
export type { I18nLoaderApi, LoaderFn, LoaderResult } from "./types";
