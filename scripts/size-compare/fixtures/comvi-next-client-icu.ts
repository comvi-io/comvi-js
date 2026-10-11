import { createI18n, I18nProvider, useI18n } from "@comvi/next/client";
import { icuCompiler } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en", compiler: icuCompiler } as never);
i18n.addMessages("en", { items: "{count, plural, one {# item} other {# items}}" } as never);
console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n);
