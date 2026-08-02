// Size-gate fixture: slim entry + ICU compiler injected from the pure /icu
// subpath. Gate: <= 7680 B min+gz — fails visibly if tag machinery ever leaks
// into the slim+ICU graph (plan Risk 9 / defect A). Measured 6592 B post-Phase-7.
import { createI18n } from "@comvi/core/slim";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never));
