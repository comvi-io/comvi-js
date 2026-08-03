// framework-slim DX gate: the SINGLE-PACKAGE svelte recipe. Every specifier in
// this file is `@comvi/svelte/slim` — no `@comvi/core` anywhere.
//
// This case exists for ONE question the size fixtures cannot answer: does a
// named re-export hop through a `sideEffects: false` wrapper tree-shake in a
// REAL bundler, in DEVELOPMENT as well as production? `@comvi/svelte/slim`
// re-exports five capability bindings from core's pure subpaths; this app uses
// exactly one of them. The runner asserts from the bundler's own module graph
// that the other three subpaths (icu, plugins, devtools) never enter it — and,
// as always, that neither the root entry nor core's tag-registration chunks do.
//
// <T> rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs).
import {
  attachLoader,
  createI18n,
  flattenCatalog,
  setI18nContext,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/svelte/slim";

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

assert(typeof createI18n === "function", "@comvi/svelte/slim exports createI18n");
assert(typeof useI18n === "function", "@comvi/svelte/slim exports useI18n");
assert(typeof setI18nContext === "function", "@comvi/svelte/slim exports setI18nContext");
assert(typeof useI18nLoader === "function", "@comvi/svelte/slim exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/svelte/slim exports useI18nPlugins");
assert(typeof attachLoader === "function", "@comvi/svelte/slim re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/svelte/slim re-exports flattenCatalog");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { msg: "a <b>c</b> d" } },
});

assert(typeof i18n.reloadTranslations === "undefined", "the preset builds a BARE slim host");
assert(typeof i18n.onMissingKey === "undefined", "the preset builds a BARE slim host");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without a /tags import",
);

// The re-exported capability is the real binding, not a stub: attaching it
// gives the host the loader API it did not have a line ago.
attachLoader(i18n);
assert(typeof i18n.reloadTranslations === "function", "attachLoader composes the loader API");
assert(typeof i18n.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
assertEqual(
  JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
  JSON.stringify({ "nav.home": "Home" }),
  "flattenCatalog is core's flattener",
);

console.log("BUNDLER_MATRIX_OK svelte-slim-preset");
