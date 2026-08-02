// Framework size fixture (plan P0.1): the D' target graph — a react app whose
// host is bare `@comvi/core/slim`. PENDING until Phase 2 retargets the
// @comvi/react value imports off the root entry; measuring it before that
// records the root graph with extra steps, not the slim graph.
import { createI18n } from "@comvi/core/slim";
import { I18nProvider, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
