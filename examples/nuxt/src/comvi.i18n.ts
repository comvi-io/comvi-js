import { createI18n, defineComviI18n, icuCompiler, loader } from "@comvi/nuxt/i18n";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { useRuntimeConfig } from "#imports";

// The module calls this once in the browser and once per server request, with
// the `comvi` options from nuxt.config.ts already resolved.
export default defineComviI18n((options) => {
  // One dynamic import per catalog, so a locale is bundled separately and
  // fetched the first time it is needed. `locale:namespace` keys belong to a
  // namespace that a page activates on demand.
  const localCatalogs = {
    en: () => import("./locales/en.json"),
    uk: () => import("./locales/uk.json"),
    de: () => import("./locales/de.json"),
    ar: () => import("./locales/ar.json"),
    "en:account": () => import("./locales/account/en.json"),
    "uk:account": () => import("./locales/account/uk.json"),
    "de:account": () => import("./locales/account/de.json"),
    "ar:account": () => import("./locales/account/ar.json"),
  };

  // Set NUXT_PUBLIC_COMVI_CDN_URL to load your Comvi project's published
  // catalogs instead; the local files stay as the fallback if the CDN is down.
  const cdnUrl = useRuntimeConfig().public.comviCdnUrl as string;
  const catalogs = cdnUrl ? cdnLoader({ cdnUrl, fallback: localCatalogs }) : loader(localCatalogs);

  return createI18n({
    ...options,
    // ICU is opt-in: without it `{count, plural, …}` is plain text.
    compiler: icuCompiler,
  }).use(catalogs);
});
