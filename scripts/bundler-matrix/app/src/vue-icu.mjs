// The default vue recipe plus EXACTLY ONE capability, every import from
// `@comvi/vue` — `icuCompiler` included, which is the point of the single-entry
// surface: reaching a capability never means reaching past your framework
// package.
//
// The POSITIVE half of the ICU claim: a size sentinel can only assert a module
// ABSENT, so this case proves ICU's presence by formatting a plural for real.
// It also pins the vue-specific half of the ICU contract: the compiler option
// travels through vue's PRESET — `createI18n` builds the host itself, so the
// option has to reach the constructor it calls, and `ssrLocale` must not disturb
// it. The runner asserts the capabilities this app does NOT buy stay out of the
// module graph.
//
// <T> rendering needs a renderer and is NOT exercised here. No top-level await:
// the webpack leg emits commonjs2.
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
