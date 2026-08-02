// Framework size fixture (plan P0.1): a vue app on the ROOT core entry —
// the "before" anchor for S = minzip(fw-vue-root) - minzip(fw-vue-slim).
// `vue` is external: this measures the comvi graph only.
import { createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
