// Framework size fixture (plan P0.1): vue on an injected bare-slim core that
// also renders <T> — the slim+tags rung of the ladder. PENDING with
// fw-vue-slim (needs `createI18nFromCore`, plan P4 step 1).
import { createI18n } from "@comvi/core/slim";
import { T, createI18nFromCore, useI18n } from "@comvi/vue/slim";

const i18n = createI18nFromCore(
  createI18n({
    locale: "en",
    translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
  }),
  { ssrLocale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
