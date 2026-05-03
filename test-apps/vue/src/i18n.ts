import { createI18n } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";
import { InContextEditorPlugin } from "@comvi/plugin-in-context-editor";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
  apiKey: import.meta.env.VITE_COMVI_API_KEY,
})
  .use(
    FetchLoader({
      cdnUrl: "https://stg-cdn.comvi.io/acda2b6a44bd4b908b2067dff9a53bba/",
    }),
  )
  .use(InContextEditorPlugin());

export default i18n;
