import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
const i18n = createI18n({
  locale: "en",
  messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);
console.log(i18n.t("items" as never, { count: 2 } as never));
