// Single-entry P3 gate: THE DEFAULT svelte recipe. Every import in this file
// comes from `@comvi/svelte`; `@comvi/core` is never named by the app.
//
// This case RETARGETS the former `svelte-slim-preset`: `/slim` was unpublished
// and is gone, so the single-package toolkit is the published root now. It also
// ABSORBS the former `svelte-on-slim`, which named `@comvi/core` for its
// constructor — the root carries that constructor, so the two cases had become
// one graph reached through two specifiers. Unlike either predecessor this
// default app uses NO capability. The runner asserts from the bundlers' module
// graphs that ICU, loader, plugins, devtools and core's tag-registration pair
// all stay out, in development as well as production. Core's BASE entry is
// present — its `createI18n` is what this app constructs with — so it is never
// an absence sentinel.
//
// It is also the regression pin for the wrapper that crashed at BIND time:
// before 0.5.0 `useI18n()` eagerly `.bind()`-ed four capability members that a
// base host does not have.
//
// <T> rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs). Not importing `T` is load-bearing on the webpack leg: it
// prunes the unused `T.svelte` re-export via `sideEffects: false` WITHOUT
// resolving it, and that leg has no svelte loader — so if `<T>` ever re-entered
// this graph the webpack build would fail outright rather than quietly grow.
import {
  createI18n,
  I18n,
  getI18nContext,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/svelte";

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

assert(typeof createI18n === "function", "@comvi/svelte exports createI18n");
assert(typeof I18n === "function", "@comvi/svelte exports I18n");
assert(typeof useI18n === "function", "@comvi/svelte exports useI18n");
assert(typeof getI18nContext === "function", "@comvi/svelte exports getI18nContext");
assert(typeof useI18nLoader === "function", "@comvi/svelte exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/svelte exports useI18nPlugins");

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

console.log("BUNDLER_MATRIX_OK svelte-default");
