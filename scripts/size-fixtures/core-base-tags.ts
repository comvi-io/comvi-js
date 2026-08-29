// Size-gate fixture: slim entry + ambient tag registration.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never));
