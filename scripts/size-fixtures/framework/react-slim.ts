// Framework size fixture (plan P0.1): the D' target graph — a react app whose
// host is core's base entry. GRADUATED in Phase 2, which retargeted the
// @comvi/react value imports off the then batteries-included root; before that
// this row recorded that root's graph with extra steps, not the slim graph.
// Post-convergence `@comvi/core` IS the base host, so comvi-core.js is in this
// graph by construction — what stays out is the tag-registration pair.
import { createI18n } from "@comvi/core";
import { I18nProvider, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
