import { createI18n } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
  apiKey: import.meta.env.VITE_COMVI_API_KEY,
});

// 0.5.0: plugin registration is a core capability — `VueI18n` no longer
// proxies `use()`. `i18n.core` is the root instance `createI18n` built.
i18n.core.use(
  FetchLoader({
    cdnUrl: "https://cdn.comvi.io/8d4beabdb0aa42008e15aa4e91a971bd/",
  }),
);

export default i18n;
