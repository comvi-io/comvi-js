import { createI18n, type I18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader, type I18nLoaderApi } from "@comvi/core/loader";
import type { NuxtHostFactory } from "@comvi/nuxt";

/**
 * The composition root, and the one file in a Nuxt app that names comvi
 * packages at all — `useI18n()`, `<T>` and `<NuxtLinkLocale>` are auto-imported,
 * so nothing under `pages/` imports anything.
 *
 * A FRESH host per call: the factory runs once for the client plugin and once
 * per server request. It receives Nuxt's RESOLVED `comvi` options, so
 * `nuxt.config.ts` stays in charge of configuration while this file stays in
 * charge of capabilities.
 *
 * That is also why `@comvi/core` is a direct dependency: the installers below
 * come from its subpaths, and a transitive dependency is not resolvable under
 * pnpm's default layout.
 */
export default ((options) =>
  createI18n({
    ...options,
    // ICU is never on by default. Without this the `{count, plural, …}` in the
    // catalog is not syntax. It is a CONSTRUCTOR argument, not something
    // `.use()` can pipe on, which is the whole reason `comvi.icu` exists as a
    // module option for apps that have no host module — and why it is ignored,
    // with a build-time warning, once this file exists.
    compiler: icuCompiler,
  }).use(
    // The lazy loader, and the reason this app renders translated HTML on the
    // server at all: SSR loading IS the loader capability. One dynamic
    // `import()` per locale, so a catalog is read the first time that locale is
    // requested.
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )) satisfies NuxtHostFactory<I18n & I18nLoaderApi>;
