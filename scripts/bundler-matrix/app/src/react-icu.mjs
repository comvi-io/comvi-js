// The default react recipe plus EXACTLY ONE capability, every import from
// `@comvi/react` — `icuCompiler` included, which is the point of the
// single-entry surface: reaching a capability never means reaching past your
// framework package.
//
// The POSITIVE half of the ICU claim: a size sentinel can only assert a module
// ABSENT, so this case proves ICU's presence by formatting a plural for real.
// The base host without a compiler THROWS E_ICU_SYNTAX on the very template
// below, so the assertions fail loudly if the re-export hop ever drops the
// compiler instead of shipping it. The runner asserts the capabilities this app
// does NOT buy stay out of the module graph.
//
// <T> rendering needs a DOM and is NOT exercised here. No top-level await: the
// webpack leg emits commonjs2.
import { createI18n, I18n, I18nProvider, icuCompiler, useI18n } from "@comvi/react";

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
assert(typeof createI18n === "function", "@comvi/react exports createI18n");
assert(typeof I18n === "function", "@comvi/react exports I18n");
assert(typeof useI18n === "function", "@comvi/react exports useI18n");
assert(isComponent(I18nProvider), "@comvi/react exports I18nProvider");
assert(
  icuCompiler !== null && typeof icuCompiler === "object",
  "@comvi/react exports icuCompiler from core's pure /icu subpath",
);

// INLINE catalogs take the constructor option: the compiler must be in place
// before the translation passed here is ingested. `.with(icu())` is the remote
// -catalog form and is measured in core, not per wrapper.
const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  compiler: icuCompiler,
  translation: {
    en: {
      items: "{count, plural, one {# item} other {# items}}",
      msg: "a <b>c</b> d",
    },
  },
});

assert(i18n instanceof I18n, "the named base I18n is the instance constructor");

// The bought capability, proved positively: both plural branches select, and
// `#` resolves to the count. Without `icuCompiler` this template throws.
assertEqual(i18n.t("items", { count: 1 }), "1 item", "ICU plural selects the `one` branch");
assertEqual(i18n.t("items", { count: 5 }), "5 items", "ICU plural selects the `other` branch");

// The capabilities this row does NOT buy — the behavioral mirror of the
// runner's module-graph absences.
assert(typeof i18n.reloadTranslations === "undefined", "ICU host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "ICU host has no plugin capability");
assert(typeof i18n.instanceId === "undefined", "ICU host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T>",
);

console.log("BUNDLER_MATRIX_OK react-icu");
