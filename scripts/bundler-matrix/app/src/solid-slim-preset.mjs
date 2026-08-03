// framework-slim DX gate: the SINGLE-PACKAGE solid recipe. Every specifier in
// this file is `@comvi/solid/slim` — no `@comvi/core` anywhere.
//
// This case exists for ONE question the size fixtures cannot answer: does a
// named re-export hop through a `sideEffects: false` wrapper tree-shake in a
// REAL bundler, in DEVELOPMENT as well as production? `@comvi/solid/slim`
// re-exports five capability bindings from core's pure subpaths; this app uses
// exactly one of them. The runner asserts from the bundler's own module graph
// that the other three subpaths (icu, plugins, devtools) never enter it — and,
// as always, that core's tag-registration chunks do not. Core's base entry IS
// in the graph — the entry's `createI18n` re-export is what this app constructs
// with — so it is never what the assertion is about.
//
// <T> rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs).
import {
  attachLoader,
  createI18n,
  flattenCatalog,
  I18nProvider,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/solid/slim";

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

const isComponent = (c) => typeof c === "function" || (typeof c === "object" && c !== null);
assert(typeof createI18n === "function", "@comvi/solid/slim exports createI18n");
assert(typeof useI18n === "function", "@comvi/solid/slim exports useI18n");
assert(isComponent(I18nProvider), "@comvi/solid/slim exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/solid/slim exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/solid/slim exports useI18nPlugins");
assert(typeof attachLoader === "function", "@comvi/solid/slim re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/solid/slim re-exports flattenCatalog");

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

console.log("BUNDLER_MATRIX_OK solid-slim-preset");
