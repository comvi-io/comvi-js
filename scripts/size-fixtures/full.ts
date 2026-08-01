// Size-gate fixture: the full default entry, as a typical app consumes it.
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never));
