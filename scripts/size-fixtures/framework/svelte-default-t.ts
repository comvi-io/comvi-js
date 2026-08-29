// Framework size fixture: the default svelte app that also renders <T> — the tags rung
// of the ladder.
import { createI18n, setI18nContext, T, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n, T);
