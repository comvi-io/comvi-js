import { createI18n, useI18n } from "@comvi/vue";
const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" } },
  ssrLocale: "en",
});
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
