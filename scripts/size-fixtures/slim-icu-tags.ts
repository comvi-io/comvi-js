// Composed-additivity fixture (plan P0.9): slim + ICU compiler + tags — the
// "+ ICU + <T>" rung of the §2.1 ladder. Measured as an ACTUAL composed graph;
// the row is never derived by summing the slim-icu and slim-tags deltas.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core/slim";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {<b>#</b> item} other {<b>#</b> items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never));
