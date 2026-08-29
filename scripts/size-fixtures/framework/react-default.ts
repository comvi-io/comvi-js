// Framework size fixture: THE DEFAULT react app.
import { createI18n, I18nProvider, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
