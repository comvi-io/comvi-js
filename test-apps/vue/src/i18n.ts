// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createCore, createI18nFromCore, icuCompiler, loader, plugins } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

// Compose the host FIRST, then wrap it: `createI18nFromCore` preserves the
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

// Plugin registration is a core capability — `VueI18n` does not proxy `use()`.
core.use(
  FetchLoader({
    cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/",
  }),
);

export const i18n = createI18nFromCore(core);

export default i18n;
