// Framework size fixture (plan P0.1): vue app on the ROOT core entry that also
// renders <T>. Root already carries ambient tags via the entry side effect, so
// the delta against fw-vue-root is the wrapper's <T> path.
import { T, createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
