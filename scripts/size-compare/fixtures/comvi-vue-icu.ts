import { createI18n, useI18n } from "@comvi/vue";
import { icuCompiler } from "@comvi/core/icu";
const i18n = createI18n({
  locale: "en",
  messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  ssrLocale: "en",
  compiler: icuCompiler,
} as never);
console.log(i18n.t("items" as never, { count: 2 } as never), useI18n);
