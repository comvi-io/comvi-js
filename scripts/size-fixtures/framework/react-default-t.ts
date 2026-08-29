// Framework size fixture: the default react app that also renders <T> — the tags rung
// of the ladder.
import { createI18n, I18nProvider, T, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
