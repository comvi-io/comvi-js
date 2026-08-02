// Framework size fixture (plan P0.1): the D' target graph — a svelte app whose
// host is bare `@comvi/core/slim`. PENDING until Phase 3 retargets the
// @comvi/svelte value imports off the root entry (svelte is also the wrapper
// that crashes at eager .bind() time on a slim host today).
import { createI18n } from "@comvi/core/slim";
import { setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n);
