// Framework size fixture (plan P0.1): the D' target graph — a vue app built
// from an injected base host via `createI18nFromCore` (plan P4 step 1).
// GRADUATED in Phase 4 (see the `fw-vue-slim` note in size-budgets.json): the
// factory ships from `@comvi/vue/slim`. What stays out of this graph is
// `@comvi/vue`'s one-call construction path and core's tag machinery — NOT
// `@comvi/core`'s base root, whose `createI18n` this fixture imports by name
// (P4 step 4 / P4-AB1).
import { createI18n } from "@comvi/core";
import { createI18nFromCore, useI18n } from "@comvi/vue/slim";

const i18n = createI18nFromCore(
  createI18n({
    locale: "en",
    translation: { en: { greeting: "Hello, {name}!" } },
  }),
  { ssrLocale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
