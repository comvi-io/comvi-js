// Framework size fixture (plan P0.1): the D' target graph — a svelte app whose
// host is core's base entry. GRADUATED in Phase 3, which retargeted the
// @comvi/svelte value imports off the then batteries-included root and moved
// the eager .bind() that used to crash useI18n() on a capability-free host.
// Post-convergence `@comvi/core` IS the base host, so comvi-core.js is in this
// graph by construction — what stays out is the tag-registration pair.
import { createI18n } from "@comvi/core";
import { setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n);
