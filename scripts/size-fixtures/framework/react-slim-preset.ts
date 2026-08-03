// Framework size fixture (framework-slim DX pass): the SINGLE-PACKAGE
// quickstart. Everything an app needs — host constructor and bindings — comes
// from `@comvi/react/slim`; `@comvi/core` is never named.
//
// Measured against `fw-react-slim`, which builds the identical graph but
// imports the constructor from `@comvi/core/slim` directly: the difference is
// the cost of the single-package surface and nothing else.
//
// The four capability re-exports this entry carries (icuCompiler,
// attachLoader/flattenCatalog, attachPlugins, attachDevtools) are unused here
// and are sentinel-asserted ABSENT from the module graph — that is the
// re-export hop paying for itself.
import { createI18n, I18nProvider, useI18n } from "@comvi/react/slim";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
