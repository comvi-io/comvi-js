// Framework size fixture (single-entry P4): the UPPER BOUND of what a Next.js
// CLIENT bundle can compose out of `@comvi/next/client` — ICU, the loader, the
// plugin host, devtools discovery and `<T>` on one host, from one specifier.
//
// NEW row in P4, and the client counterpart of `fw-react-full-composite`. It is
// the migration ceiling: a 0.4 next client app whose host carried everything
// pays THIS after the convergence, and the row exists so that number is
// measured rather than argued. It is NOT a behavior-parity claim against the
// 0.4 client — 0.4 also registered string-API tags ambiently, and convergence
// deliberately makes that an explicit `@comvi/core/tags` import, which no next
// entry re-exports. The published `@comvi/next` root's parity is a different
// row (`fw-next-composed-factory`) with its own behavioural suite.
//
// PARITY ORDERING, inherited from `core-full-composite.ts`: loader and plugin
// host installed FIRST, so the loader's nested-catalog flattener is present
// when the catalog is ingested, and devtools discovery LAST, so `instanceId`
// stays the final public own property. ICU takes the constructor option because
// the catalog below is ingested by `addTranslations` AFTER construction.
//
// `<T>` reaches the pure `@comvi/core/rich-text` seam and passes tag syntax per
// call, so this row still asserts core's `comvi-core-tags` entry and its
// register-tags chunk ABSENT. `next` and `react` are external, so this measures
// the comvi graph only.
import {
  createI18n,
  devtools,
  I18nProvider,
  icuCompiler,
  loader,
  plugins,
  T,
  useI18n,
} from "@comvi/next/client";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
i18n.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
i18n.with(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
