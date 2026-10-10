// THE DEFAULT vue recipe. Every import comes from `@comvi/vue`; `@comvi/core` is
// never named by the app, which uses NO capability — the composed escape hatch
// keeps its own case (`vue-composed`), because vue is the one binding whose
// `createI18n` is a wrapper preset rather than core's constructor and both
// halves ship from this entry.
//
// The runner asserts from the bundlers' module graphs that ICU, loader, plugins,
// devtools and core's tag-registration pair all stay out, in development as well
// as production. Core's BASE entry is present — the preset constructs on it — so
// it is never an absence sentinel.
//
// <T> rendering needs a renderer and is NOT exercised here. No top-level await:
// the webpack leg emits commonjs2.
import { createI18n, createI18nFromCore, useI18n } from "@comvi/vue";

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
assert(typeof createI18nFromCore === "function", "@comvi/vue exports createI18nFromCore");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");

const i18n = createI18n({
  locale: "en",
  ssrLocale: "en",
  exposeGlobal: false,
  messages: { en: { plain: "hello", msg: "a <b>c</b> d" } },
});

// `I18n` is a TYPE from a binding root (P5), so the pin is structural.
assert(typeof i18n.core.t === "function", "the preset's host is a core host");
assert(typeof i18n.core.use === "function", "the pipe is on the preset's core host");
assert(typeof i18n.core.reloadMessages === "undefined", "the preset builds a BASE host");
assert(typeof i18n.core.onMissingKey === "undefined", "default host has no plugin capability");
assert(typeof i18n.core.instanceId === "undefined", "default host has no devtools discovery");
assert("reloadMessages" in i18n === false, "VueI18n does not proxy loader capabilities");
assert("registerPlugin" in i18n === false, "VueI18n does not proxy the plugin host either");
// …but `use` IS on the wrapper: the composition verb is the wrapper's own.
assert(typeof i18n.use === "function", "VueI18n has the composition verb");
assertEqual(i18n.t("plain"), "hello", "the preset host translates through the wrapper");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T> or a /tags import",
);

console.log("BUNDLER_MATRIX_OK vue-default");
