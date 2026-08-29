// Framework size fixture: the default vue app built the OTHER way — an injected host
// through `createCore` + `createI18nFromCore` instead of the one-call preset.
import { createCore, createI18nFromCore, useI18n } from "@comvi/vue";

const i18n = createI18nFromCore(
  createCore({
    locale: "en",
    translation: { en: { greeting: "Hello, {name}!" } },
  }),
  { ssrLocale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
