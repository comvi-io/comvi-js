// Framework size fixture (plan P0.1): a solid app on the ROOT core entry —
// the "before" anchor for S = minzip(fw-solid-root) - minzip(fw-solid-slim).
// `solid-js` is external: this measures the comvi graph only.
import { createI18n } from "@comvi/core";
import { I18nProvider, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
