// Size-gate fixture: THE entry — the base host (simple compiler, no ICU, no tags, no
// capabilities).
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
