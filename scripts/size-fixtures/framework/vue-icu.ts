// Framework size fixture: the default vue app with ICU message formatting, still
// through ONE specifier.
import { createI18n, icuCompiler, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
  ssrLocale: "en",
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never), useI18n);
