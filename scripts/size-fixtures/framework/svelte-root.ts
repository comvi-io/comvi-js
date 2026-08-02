// Framework size fixture (plan P0.1): a svelte app on the ROOT core entry —
// the "before" anchor for S = minzip(fw-svelte-root) - minzip(fw-svelte-slim).
// `svelte` is external: this measures the comvi graph only (dist/T.svelte is
// compiled by the size gate the way a consumer's svelte plugin compiles it).
import { createI18n } from "@comvi/core";
import { setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n);
