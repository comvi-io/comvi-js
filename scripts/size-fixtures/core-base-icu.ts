// Size-gate fixture: the base host + the ICU compiler injected from the pure
// /icu subpath. Gate: <= 7680 B min+gz — fails visibly if tag machinery ever
// leaks into the base+ICU graph (plan Risk 9 / defect A). Observed 5890 B on the
// landed run; the 6592 B this header used to quote is the HISTORICAL
// post-Phase-7 measurement, and the frozen budget is the release captain's
// post-0.5.0 ratchet, not a margin.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never));
