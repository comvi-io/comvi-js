// Framework size fixture: the default svelte app with ICU message formatting, still
// through ONE specifier.
import { createI18n, icuCompiler, setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never), setI18nContext, useI18n);
