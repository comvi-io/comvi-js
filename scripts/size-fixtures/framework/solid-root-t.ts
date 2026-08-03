// Framework size fixture (plan P0.1): solid app on core's root entry — the
// BASE host, which registers nothing on import — that also renders <T>. So the
// delta against fw-solid-root is the whole <T> path: the component chunk plus
// the @comvi/core/tags module it imports, and that import is also what makes
// tag syntax ambient in this graph.
import { createI18n } from "@comvi/core";
import { I18nProvider, T, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
