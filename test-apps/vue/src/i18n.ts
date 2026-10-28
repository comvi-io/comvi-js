// The repo's runnable CDN reference: the canonical recipe from the Vue README's
// "From the Comvi CDN" section, wired to whatever CDN endpoint you configure.
//
// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createI18n, icuCompiler } from "@comvi/vue";
import { cdn } from "@comvi/core/cdn";

// `createI18n` builds the base host and each `.use(…)` composes a capability
// on it, widening the type of `i18n.core` as it goes, so `i18n.core.use(…)`
// stays typed.
//
// ICU is the `compiler` option, not something `.use()` pipes on: it is read in
// the constructor and applies to every catalog this instance ingests.
//
// The loader is `cdn()` from `@comvi/core/cdn` (lot 2c removed
// `@comvi/plugin-fetch-loader`); this app moves to the 0.8 `createI18n` with
// `@comvi/vue` in lot 4. An app that reads the authenticated API uses `api(base,
// { key })` from the same subpath, on a server.
export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
  compiler: icuCompiler,
  // Set VITE_COMVI_CDN_URL in `.env.local` to run this against live catalogs —
  // Copy URL on the CDN Endpoint card under Settings → Content Deploy. The
  // fallback is the docs' example endpoint and serves nothing.
  loader: cdn(
    import.meta.env.VITE_COMVI_CDN_URL ?? "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b/",
  ),
});

export default i18n;
