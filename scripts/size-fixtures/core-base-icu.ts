// Size-gate fixture: the base host + the ICU compiler injected from the pure
// /icu subpath. Gated on measured + 5%, so it fails visibly if tag machinery
// ever leaks into the base+ICU graph (plan Risk 9 / defect A). The 7680 B this
// header used to quote was a frozen ceiling carrying ~1.8 KB of dead headroom;
// the 0.5.0 hardening pass ratcheted it to the standard rule (size-budgets.md).
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never));
