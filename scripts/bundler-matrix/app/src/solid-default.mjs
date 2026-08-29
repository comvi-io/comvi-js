// Single-entry P3 gate: THE DEFAULT solid recipe. Every import in this file
// comes from `@comvi/solid`; `@comvi/core` is never named by the app.
//
// This case RETARGETS the former `solid-slim-preset`: `/slim` was unpublished
// and is gone, so the single-package toolkit is the published root now. It also
// ABSORBS the former `solid-on-slim`, which named `@comvi/core` for its
// constructor — the root carries that constructor, so the two cases had become
// one graph reached through two specifiers. Unlike either predecessor this
// default app uses NO capability. The runner asserts from the bundlers' module
// graphs that ICU, loader, plugins, devtools and core's tag-registration pair
// all stay out, in development as well as production. Core's BASE entry is
// present — its `createI18n` is what this app constructs with — so it is never
// an absence sentinel.
//
// It is also the regression pin the absorbed case contributed: the base host
// really lacks the loader/plugin capability members, so a wrapper that bound
// them eagerly would crash right here.
//
// <T> rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs). No top-level await: the webpack leg emits commonjs2.
import {
  createI18n,
  I18n,
  I18nProvider,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/solid";

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

const isComponent = (component) =>
  typeof component === "function" || (typeof component === "object" && component !== null);
assert(typeof createI18n === "function", "@comvi/solid exports createI18n");
assert(typeof I18n === "function", "@comvi/solid exports I18n");
assert(typeof useI18n === "function", "@comvi/solid exports useI18n");
assert(isComponent(I18nProvider), "@comvi/solid exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/solid exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/solid exports useI18nPlugins");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { msg: "a <b>c</b> d" } },
});

assert(i18n instanceof I18n, "the named base I18n is the instance constructor");
assert(typeof i18n.reloadTranslations === "undefined", "default host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "default host has no plugin capability");
assert(typeof i18n.instanceId === "undefined", "default host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T>",
);

console.log("BUNDLER_MATRIX_OK solid-default");
