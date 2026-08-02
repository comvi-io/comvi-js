// Framework size fixture (plan P0.1): svelte app on the ROOT core entry that
// also renders <T>. Root already carries ambient tags via the entry side
// effect, so the delta against fw-svelte-root is the wrapper's <T> path.
import { createI18n } from "@comvi/core";
import { T, setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n, T);
