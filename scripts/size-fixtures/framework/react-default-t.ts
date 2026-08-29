// Framework size fixture (plan P0.1): react on a bare-slim host that also
// renders <T> — the slim+tags rung of the ladder. PENDING with fw-react-slim.
import { createI18n } from "@comvi/core";
import { I18nProvider, T, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
