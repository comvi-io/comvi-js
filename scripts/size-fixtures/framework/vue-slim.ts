// Framework size fixture (plan P0.1): the D' target graph — a vue app built
// from an injected bare-slim core via `createI18nFromCore` (plan P4 step 1).
// PENDING until Phase 4 lands that factory in a root-free module; the root
// `createI18n` module must tree-shake out of this graph (P4 step 4 / P4-AB1).
import { createI18n } from "@comvi/core/slim";
import { createI18nFromCore, useI18n } from "@comvi/vue/slim";

const i18n = createI18nFromCore(
  createI18n({
    locale: "en",
    translation: { en: { greeting: "Hello, {name}!" } },
  }),
  { ssrLocale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
