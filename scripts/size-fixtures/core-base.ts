// Size-gate fixture: THE entry — the base host (simple compiler, no ICU, no
// tags, no capabilities). This is the anchor every other core row is read
// against; its budget is measured + 5%, like every gated row (the +32 B
// base-successor drift rule it used to carry is retired — scripts/size-budgets.md).
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
