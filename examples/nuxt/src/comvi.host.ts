import { createI18n, icuCompiler, loader } from "@comvi/nuxt/host";
import type { NuxtHostFactory, NuxtServerLoaderHost } from "@comvi/nuxt";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import { useRuntimeConfig } from "#imports";

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
 * The local-catalog path names `@comvi/nuxt` only: `@comvi/nuxt/host`
 * re-exports core's installers, so that recipe is followable from
 * `pnpm add @comvi/nuxt` alone — a transitive `@comvi/core` is not resolvable
 * under pnpm's default layout. The opt-in CDN path adds one package of its own,
 * `@comvi/plugin-fetch-loader`.
 */
export default ((options) => {
  // Connect to Comvi, opt-in: `runtimeConfig.public.comviCdnUrl`, set through
  // `NUXT_PUBLIC_COMVI_CDN_URL`. Empty — the default, and what StackBlitz runs —
  // and the import map is the only loader.
  const cdnUrl = useRuntimeConfig().public.comviCdnUrl as string;

  // The lazy loader, and the reason this app renders translated HTML on the
  // server at all: SSR loading IS the loader capability. One dynamic `import()`
  // per locale, so a catalog is read the first time that locale is requested.
  //
  // One import map, two uses: the loader itself by default, and the CDN loader's
  // `fallback` when the CDN is configured but unreachable. `ar` is not in the
  // switcher; it is the right-to-left locale the e2e suite switches to.
  const localCatalogs = {
    en: () => import("./locales/en.json"),
    uk: () => import("./locales/uk.json"),
    de: () => import("./locales/de.json"),
    ar: () => import("./locales/ar.json"),
  };

  const catalogs: ReturnType<typeof loader> = cdnUrl
    ? cdnLoader({ cdnUrl, fallback: localCatalogs })
    : loader(localCatalogs);

  return createI18n({
    ...options,
    // ICU is never on by default. Without this the `{count, plural, …}` in the
    // catalog is not syntax. It is a CONSTRUCTOR argument, not something
    // `.use()` can pipe on, which is the whole reason `comvi.icu` exists as a
    // module option: with `icu: true` in nuxt.config.ts the module puts
    // `compiler: icuCompiler` into `options` and this line is unnecessary.
    compiler: icuCompiler,
  }).use(catalogs);
}) satisfies NuxtHostFactory<NuxtServerLoaderHost>;
