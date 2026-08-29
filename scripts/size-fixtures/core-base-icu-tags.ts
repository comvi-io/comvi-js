// Composed-additivity fixture: base host + ICU compiler + tags, measured as an ACTUAL
// composed graph — never derived by summing the per-capability deltas.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {<b>#</b> item} other {<b>#</b> items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never));
