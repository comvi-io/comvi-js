// The converged single entry: everything this app composes — the base host,
// the ICU compiler for the plural catalogs, the loader for the CDN and the
// plugin host for the fetch loader — comes from `@comvi/vue`.
//
// The ONE exception is `@comvi/core/tags`: importing it registers tag syntax
// ambiently, so the wrapper deliberately does not re-export it and an app that
// wants tags in the plain `t()` string API names the side effect itself.
import "@comvi/core/tags";
import { createCore, createI18nFromCore, icuCompiler, loader, plugins } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

// Compose the host FIRST, then wrap it. `createCore` is `@comvi/core`'s own
// constructor, re-exported by `@comvi/vue` under a name of its own because
// vue's `createI18n` is the one-call preset. `createI18nFromCore` preserves the
// host's exact type, so `i18n.core.use(…)` stays typed.
const core = createCore({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
  apiKey: import.meta.env.VITE_COMVI_API_KEY,
})
  .with(loader())
  .with(plugins());

// 0.5.0: plugin registration is a core capability — `VueI18n` does not proxy
// `use()`. `i18n.core` is the composed host built above.
core.use(
  FetchLoader({
    cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/",
  }),
);

export const i18n = createI18nFromCore(core);

export default i18n;
