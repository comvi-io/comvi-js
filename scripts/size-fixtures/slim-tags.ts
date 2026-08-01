// Size-gate fixture: slim entry + ambient tag registration. Informational
// (printed, not gated) until Phase 1 stabilizes; then gated at slim + 1.2 KB.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core/slim";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
