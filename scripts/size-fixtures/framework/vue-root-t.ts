// Framework size fixture (plan P0.1): vue app whose host vue's own createI18n
// builds on core's root entry — the BASE host, which registers nothing on
// import — and that also renders <T>. So the delta against fw-vue-root is the
// whole <T> path: the component chunk plus the @comvi/core/tags module it
// imports, and that import is also what makes tag syntax ambient in this
// graph.
import { T, createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
