// Single-entry P3 gate: THE DEFAULT vue recipe. Every import in this file
// comes from `@comvi/vue`; `@comvi/core` is never named by the app.
//
// This case ABSORBS the former `vue-on-slim` and RETARGETS the former
// `vue-slim-preset`: `/slim` was unpublished and is gone, so the
// single-package toolkit is the published root now, and the two apps that used
// to reach the same wrapper through two specifiers are one graph. Unlike the
// old preset case, this default app deliberately uses NO capability; the
// composed escape hatch keeps its own case (`vue-composed`), because vue is the
// one binding whose `createI18n` is a wrapper preset rather than core's
// constructor and both halves ship from this entry.
//
// The runner asserts from the bundlers' module graphs that ICU, loader,
// plugins, devtools and core's tag-registration pair all stay out, in
// development as well as production. Core's BASE entry is present — the preset
// constructs on it — so it is never an absence sentinel.
//
// <T> rendering needs a renderer and is NOT exercised here (same documented
// skip as wrappers.mjs). No top-level await: the webpack leg emits commonjs2.
import { createCore, createI18n, createI18nFromCore, I18n, useI18n } from "@comvi/vue";

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

assert(typeof createI18n === "function", "@comvi/vue exports createI18n");
assert(typeof createCore === "function", "@comvi/vue exports createCore");
assert(typeof createI18nFromCore === "function", "@comvi/vue exports createI18nFromCore");
assert(typeof I18n === "function", "@comvi/vue exports the base I18n class");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");

const i18n = createI18n({
  locale: "en",
  ssrLocale: "en",
  exposeGlobal: false,
  translation: { en: { plain: "hello", msg: "a <b>c</b> d" } },
});

assert(i18n.core instanceof I18n, "the named base I18n is the preset's host constructor");
assert(typeof i18n.core.with === "function", "the pipe is on the preset's core host");
assert(typeof i18n.core.reloadTranslations === "undefined", "the preset builds a BASE host");
assert(typeof i18n.core.onMissingKey === "undefined", "default host has no plugin capability");
assert(typeof i18n.core.instanceId === "undefined", "default host has no devtools discovery");
assert("reloadTranslations" in i18n === false, "VueI18n does not proxy loader capabilities");
assert("use" in i18n === false, "VueI18n does not proxy the plugin host either");
assertEqual(i18n.t("plain"), "hello", "the preset host translates through the wrapper");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T> or a /tags import",
);

console.log("BUNDLER_MATRIX_OK vue-default");
