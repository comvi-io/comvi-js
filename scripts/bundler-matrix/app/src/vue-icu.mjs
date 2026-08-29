// Single-entry P3 gate: the default vue recipe plus EXACTLY ONE capability.
// Every import comes from `@comvi/vue`; `@comvi/core` is never named by the
// app — including for `icuCompiler`, which is the point of the single-entry
// surface: reaching a capability never means reaching past your framework
// package.
//
// NEW case in P3, modelled on `react-icu`. It is the POSITIVE half of the
// `fw-vue-icu` size row: a size sentinel can only assert a module ABSENT, so
// that row leaves ICU out of its sentinel list and this case proves ICU's
// presence by running the bundle and formatting a plural for real, in both
// bundlers and both modes. The base host without a compiler THROWS
// E_ICU_SYNTAX on the very template below, so the assertions here fail loudly
// if the re-export hop ever drops the compiler instead of shipping it.
//
// It also pins the vue-specific half of the ICU contract: the compiler option
// travels through vue's PRESET — `createI18n` builds the host itself, so the
// option has to reach the constructor it calls, and `ssrLocale` must not
// disturb it.
//
// The runner also asserts from the module graphs that the capabilities this app
// does NOT buy — loader, plugins, devtools — plus core's tag-registration pair
// stay out. The behavioral mirror of those absences is asserted below. Core's
// BASE entry is present, since the preset constructs on it, so it is never an
// absence sentinel.
//
// <T> rendering needs a renderer and is NOT exercised here (same documented
// skip as wrappers.mjs). No top-level await: the webpack leg emits commonjs2.
import { createI18n, I18n, icuCompiler, useI18n } from "@comvi/vue";

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
assert(typeof I18n === "function", "@comvi/vue exports the base I18n class");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");
assert(
  icuCompiler !== null && typeof icuCompiler === "object",
  "@comvi/vue exports icuCompiler from core's pure /icu subpath",
);

// INLINE catalogs take the constructor option: the compiler must be in place
// before the translation passed here is ingested. `.with(icu())` is the remote
// -catalog form, goes on `i18n.core`, and is measured in core, not per wrapper.
const i18n = createI18n({
  locale: "en",
  ssrLocale: "en",
  exposeGlobal: false,
  compiler: icuCompiler,
  translation: {
    en: {
      items: "{count, plural, one {# item} other {# items}}",
      msg: "a <b>c</b> d",
    },
  },
});

assert(i18n.core instanceof I18n, "the named base I18n is the preset's host constructor");

// The bought capability, proved positively: both plural branches select, and
// `#` resolves to the count. Without `icuCompiler` this template throws.
assertEqual(i18n.t("items", { count: 1 }), "1 item", "ICU plural selects the `one` branch");
assertEqual(i18n.t("items", { count: 5 }), "5 items", "ICU plural selects the `other` branch");

// The capabilities this row does NOT buy — the behavioral mirror of the
// runner's module-graph absences.
assert(typeof i18n.core.reloadTranslations === "undefined", "ICU host has no loader capability");
assert(typeof i18n.core.onMissingKey === "undefined", "ICU host has no plugin capability");
assert(typeof i18n.core.instanceId === "undefined", "ICU host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T>",
);

console.log("BUNDLER_MATRIX_OK vue-icu");
