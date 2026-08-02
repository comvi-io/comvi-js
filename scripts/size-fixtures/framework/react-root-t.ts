// Framework size fixture (plan P0.1): react app on the ROOT core entry that
// also renders <T>. Root already carries ambient tags via the entry side
// effect, so the delta against fw-react-root is the wrapper's <T> path.
import { createI18n } from "@comvi/core";
import { I18nProvider, T, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
