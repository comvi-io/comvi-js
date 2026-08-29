// Framework size fixture (single-entry P3): the UPPER BOUND of the capabilities
// the Vue root exports, composed on one host from one specifier, plus <T>.
// ICU, loader, plugins, devtools and the pure rich-text path are all retained.
//
// RE-ANCHORED from `fw-vue-root` / `fw-vue-root-t`, whose fixtures measured the
// 0.4 batteries-included era: back then vue's `createI18n` built its host on a
// core root that dragged composed core in whether an app used it or not. This
// row is no longer behavior-identical to that historical root because 0.4 also
// registered string-API tags ambiently; convergence deliberately makes that an
// explicit `@comvi/core/tags` import.
//
// PARITY ORDERING, inherited from `core-full-composite.ts` and proved
// behaviour-identical to the 0.4 composed host by
// packages/core/tests/features/composite-parity.test.ts: loader + plugin host
// installed FIRST, so the loader's nested-catalog flattener is present when the
// catalog is ingested, and devtools discovery LAST, so `instanceId` stays the
// final public own property. ICU takes the constructor option because the
// catalog below is ingested by `addTranslations` AFTER construction.
//
// Vue composes on the CORE, not on the wrapper: `createCore` builds the host,
// the pipe runs on it, and `createI18nFromCore` wraps the result while
// preserving its exact type. That is the vue-specific half of this row — the
// escape hatch react/solid/svelte do not have, because their `createI18n`
// returns the host itself.
//
// <T> reaches the pure `@comvi/core/rich-text` seam and passes tag syntax per
// call. It does not import or execute ambient registration, so the size row
// asserts the `comvi-core-tags` entry and register-tags chunk absent.
//
// Every capability exported by @comvi/vue is otherwise present. `vue` is
// external, so this measures the comvi graph only.
import {
  createCore,
  createI18nFromCore,
  devtools,
  icuCompiler,
  loader,
  plugins,
  T,
  useI18n,
} from "@comvi/vue";

const core = createCore({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
core.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
core.with(devtools());

const i18n = createI18nFromCore(core, { ssrLocale: "en" });

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
