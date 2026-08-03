// Size-gate fixture: THE entry — the base host (simple compiler, no ICU, no
// tags, no capabilities). This is the row every core-dependent budget derives
// from; see scripts/size-budgets.json for the +32 B drift rule.
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
