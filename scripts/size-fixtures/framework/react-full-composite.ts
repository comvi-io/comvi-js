// Framework size fixture (single-entry P2): the UPPER BOUND of the capabilities
// the React root exports, composed on one host from one specifier, plus <T>.
// ICU, loader, plugins, devtools and the pure rich-text path are all retained.
//
// RE-ANCHORED from `fw-react-root`, whose fixture measured the 0.4
// batteries-included era: back then the wrapper's root dragged composed core in
// whether an app used it or not. This row is no longer behavior-identical to
// that historical root because 0.4 also registered string-API tags ambiently;
// convergence deliberately makes that an explicit `@comvi/core/tags` import.
//
// PARITY ORDERING, inherited from `core-full-composite.ts` and proved
// behaviour-identical to the 0.4 composed host by
// packages/core/tests/features/composite-parity.test.ts: loader + plugin host
// installed FIRST, so the loader's nested-catalog flattener is present when the
// catalog is ingested, and devtools discovery LAST, so `instanceId` stays the
// final public own property. ICU takes the constructor option because the
// catalog below is ingested by `addTranslations` AFTER construction.
//
// <T> reaches the pure `@comvi/core/rich-text` seam and passes tag syntax per
// call. It does not import or execute ambient registration, so the size row
// asserts the `comvi-core-tags` entry and register-tags chunk absent.
//
// Every capability exported by @comvi/react is otherwise present. `react` is
// external, so this measures the comvi graph only.
import {
  createI18n,
  devtools,
  I18nProvider,
  icuCompiler,
  loader,
  plugins,
  T,
  useI18n,
} from "@comvi/react";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
i18n.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
i18n.with(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
