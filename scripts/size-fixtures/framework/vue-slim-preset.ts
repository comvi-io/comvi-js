// Framework size fixture (framework-slim DX pass): the SINGLE-PACKAGE
// quickstart. Everything an app needs — host constructor and bindings — comes
// from `@comvi/vue/slim`; `@comvi/core` is never named.
//
// Measured against `fw-vue-slim`, which builds the same wrapper graph through
// `createI18nFromCore` and a `@comvi/core/slim` constructor: the difference is
// the cost of the single-package surface plus vue's one-call preset glue (the
// preset is a real function here — it has a `VueI18n` to construct — where
// react/solid/svelte re-export core's constructor unchanged).
//
// The four capability re-exports this entry carries (icuCompiler,
// attachLoader/flattenCatalog, attachPlugins, attachDevtools) are unused here
// and are sentinel-asserted ABSENT from the module graph — that is the
// re-export hop paying for itself.
import { createI18n, useI18n } from "@comvi/vue/slim";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
  ssrLocale: "en",
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
