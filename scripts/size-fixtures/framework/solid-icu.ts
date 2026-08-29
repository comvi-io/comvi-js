// Framework size fixture: the default solid app with ICU message formatting, still
// through ONE specifier.
import { createI18n, I18nProvider, icuCompiler, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n);
