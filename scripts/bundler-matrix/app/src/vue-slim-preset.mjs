// framework-slim DX gate: the SINGLE-PACKAGE vue recipe. Every specifier in
// this file is `@comvi/vue/slim` — no `@comvi/core` anywhere.
//
// This case exists for ONE question the size fixtures cannot answer: does a
// named re-export hop through a `sideEffects: false` wrapper tree-shake in a
// REAL bundler, in DEVELOPMENT as well as production? `@comvi/vue/slim`
// re-exports five capability bindings from core's pure subpaths; this app uses
// exactly one of them. The runner asserts from the bundler's own module graph
// that the other three subpaths (icu, plugins, devtools) never enter it — and,
// as always, that neither the root entry nor core's tag-registration chunks do.
//
// Vue is the one wrapper whose preset is a real function: it has a `VueI18n`
// to construct. `createCore` + `createI18nFromCore` remain the custom-host
// path, and both are exercised here so the single-package promise covers it.
//
// <T> rendering needs a renderer and is NOT exercised here.
import {
  attachLoader,
  createCore,
  createI18n,
  createI18nFromCore,
  flattenCatalog,
  useI18n,
} from "@comvi/vue/slim";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

assert(typeof createI18n === "function", "@comvi/vue/slim exports createI18n");
assert(typeof createCore === "function", "@comvi/vue/slim exports createCore");
assert(typeof createI18nFromCore === "function", "@comvi/vue/slim exports createI18nFromCore");
assert(typeof useI18n === "function", "@comvi/vue/slim exports useI18n");
assert(typeof attachLoader === "function", "@comvi/vue/slim re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/vue/slim re-exports flattenCatalog");

// The one-call preset.
const i18n = createI18n({
  locale: "en",
  ssrLocale: "en",
  exposeGlobal: false,
  translation: { en: { plain: "hello", msg: "a <b>c</b> d" } },
});

assert(typeof i18n.core.reloadTranslations === "undefined", "the preset builds a BARE slim host");
assert("reloadTranslations" in i18n === false, "VueI18n does not proxy loader capabilities");
assertEqual(i18n.t("plain"), "hello", "the preset host translates through the wrapper");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without a /tags import",
);

// The custom-host path, still one package: createCore is core's constructor.
const composed = attachLoader(createCore({ locale: "en", exposeGlobal: false }));
const wrapped = createI18nFromCore(composed);
assert(wrapped.core === composed, "createI18nFromCore exposes the injected core");
assert(typeof composed.reloadTranslations === "function", "attachLoader composes the loader API");
assert(typeof composed.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
assertEqual(
  JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
  JSON.stringify({ "nav.home": "Home" }),
  "flattenCatalog is core's flattener",
);

console.log("BUNDLER_MATRIX_OK vue-slim-preset");
