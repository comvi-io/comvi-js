// The repo's runnable CDN reference: the canonical recipe from the Vue README's
// "From the Comvi CDN" section, wired to a live distribution.
//
// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createCore, createI18nFromCore, icu } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

// Installers run on the HOST, so compose FIRST and wrap afterwards:
// `createI18nFromCore` preserves the host's exact type, so `i18n.core.use(…)`
// stays typed.
//
// `icu()` comes before `cdnLoader(…)` because it has to be composed before
// the first catalog reaches the host — the library's only ordering rule. The
// loader's own capabilities (`/loader`, `/plugins`) are composed by the
// installer itself.
//
// `cdnLoader` comes from `@comvi/plugin-fetch-loader/cdn`, the CDN-only entry:
// this app reads a public distribution and never the authenticated API, so it
// has no reason to bundle the API request path. An app that does talk to the
// API composes `fetchLoader` from the package root and passes `apiKey` as a
// HOST option instead.
const core = createCore({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
})
  .with(icu())
  .with(
    cdnLoader({
      // The distribution id comes from the Comvi platform: open your project
      // and read it off the Distributions page.
      cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/",
    }),
  );

export const i18n = createI18nFromCore(core);

export default i18n;
