// Framework size fixture (plan P0.1): svelte on a bare-slim host that also
// renders <T> — the slim+tags rung of the ladder. PENDING with fw-svelte-slim.
import { createI18n } from "@comvi/core/slim";
import { T, setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n, T);
