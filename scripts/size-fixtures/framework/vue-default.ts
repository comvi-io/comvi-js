// Framework size fixture: THE DEFAULT vue app.
import { createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
  ssrLocale: "en",
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
