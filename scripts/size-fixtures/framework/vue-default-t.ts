// Framework size fixture: the default vue app that also renders <T> — the tags rung of
// the ladder.
import { createI18n, T, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
  ssrLocale: "en",
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
