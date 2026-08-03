// The converged single entry: capabilities are composed on explicitly.
import "@comvi/core/tags";
import { createI18nFromCore } from "@comvi/vue";
import { createI18n as createCore } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

// Compose the host FIRST, then wrap it: `@comvi/core`'s `createI18n` builds the
// base host and
// the capabilities this app needs are explicit imports. `createI18nFromCore`
// preserves the host's exact type, so `i18n.core.use(…)` stays typed.
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
