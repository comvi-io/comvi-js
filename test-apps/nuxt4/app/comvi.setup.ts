import type { NuxtI18nSetup } from "@comvi/nuxt";

// No type argument, and that is the point: `NuxtI18nSetup` defaults to the host
// `app/comvi.i18n.ts` actually returns, read off the factory by the module's
// generated `.nuxt/types/comvi-i18n.ts`. The `onLoadError` call below compiles
// BECAUSE that file composes `loader(map)` — delete the `.use(loader(...))`
// there and this line stops compiling, which is the whole cross-check: the
// hook's host used to be an assertion about a file reached by a string path
// that no type-checker opened.
//
// `onLoadError` rather than a namespace activation on purpose. It is a loader
// capability, so it carries the same proof, and it is what a setup hook is
// actually for: subscribing before `init()` runs its first load. Pre-activating
// "admin" here would have made `pages/namespaces.vue` — whose whole demo is the
// on-demand load and the LOADED / NOT LOADED badge — render as already loaded.
export default (({ core }) => {
  core.onLoadError((locale, namespace, error) => {
    console.warn(`[nuxt4] catalog ${locale}:${namespace} failed to load: ${error.message}`);
  });
}) satisfies NuxtI18nSetup;
