// Informational fixture: the ICU INSTALLER path — `.with(icu())` before any catalog is
// ingested, which is the remote-catalog recipe.
import { createI18n } from "@comvi/core";
import { icu } from "@comvi/core/icu";

const i18n = createI18n({ locale: "en" }).with(icu());
i18n.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });

console.log(i18n.t("items" as never, { count: 2 } as never));
