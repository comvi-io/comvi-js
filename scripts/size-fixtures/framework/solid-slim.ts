// Framework size fixture (plan P0.1): the D' target graph — a solid app whose
// host is bare `@comvi/core/slim`. PENDING until Phase 3 retargets the
// @comvi/solid value imports off the root entry; measuring it before that
// records the root graph with extra steps, not the slim graph.
import { createI18n } from "@comvi/core/slim";
import { I18nProvider, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
