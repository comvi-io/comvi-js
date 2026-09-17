// The repo's runnable CDN reference: the canonical recipe from the Vue README's
// "From the Comvi CDN" section, wired to a live distribution.
//
// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createI18n, icuCompiler } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

// `createI18n` builds the base host and each `.use(…)` composes a capability
// on it, widening the type of `i18n.core` as it goes, so `i18n.core.use(…)`
// stays typed.
//
// ICU is the `compiler` option, not something `.use()` pipes on: it is read in
// the constructor and applies to every catalog this instance ingests. The
// loader's own capabilities (`/loader`, `/plugins`) are composed by the
// installer itself.
//
// `cdnLoader` comes from `@comvi/plugin-fetch-loader/cdn`, the CDN-only entry:
// this app reads a public distribution and never the authenticated API, so it
// has no reason to bundle the API request path. An app that does talk to the
// API composes `fetchLoader` from the package root and passes `apiKey` as a
// HOST option instead.
export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
  compiler: icuCompiler,
}).use(
  cdnLoader({
    // The whole URL comes from the Comvi platform: open your project and use
    // Copy URL on the CDN Endpoint card under Settings → Content Deploy.
    cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/",
  }),
);

export default i18n;

// The API-mode variant, kept runnable by hand: swap the block above for this
// one and set VITE_COMVI_API_KEY to exercise the authenticated request path,
// which nothing else in this repo runs against a live server.
//
// import { fetchLoader } from "@comvi/plugin-fetch-loader";
//
// export const i18n = createI18n({
//   locale: "en",
//   fallbackLocale: "en",
//   tagInterpolation: { basicHtmlTags: ["strong", "em", "br", "a"] },
//   // The API key is a HOST option, not a `fetchLoader` option: the loader
//   // reads `i18n.apiKey` and then talks to the API instead of the CDN.
//   apiKey: import.meta.env.VITE_COMVI_API_KEY,
//   compiler: icuCompiler,
// }).use(fetchLoader({ cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/" }));
