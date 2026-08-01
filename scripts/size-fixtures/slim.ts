// Size-gate fixture: the slim entry (simple compiler, no ICU, no tags).
// Gate: <= 5.5 KB min+gz. Pending until Phase 1 ships @comvi/core/slim.
import { createI18n } from "@comvi/core/slim";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
