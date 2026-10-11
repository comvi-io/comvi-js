// Same message text as comvi-core-icu.ts, simple compiler (no ICU): isolates what the ICU
// compiler adds without changing the fixture's text, key or parameters.
import { createI18n } from "@comvi/core";
const i18n = createI18n({
  locale: "en",
  messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
});
console.log(i18n.t("items" as never, { count: 2 } as never));
