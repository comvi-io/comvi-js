// The default Next.js CLIENT recipe plus EXACTLY ONE capability, every import
// from `@comvi/next/client` — `icuCompiler` included, which is the point of the
// single-package surface: reaching a capability never means reaching past your
// framework package.
//
// The POSITIVE half of the ICU claim: a size sentinel can only assert a module
// ABSENT, so this case proves ICU's presence by formatting a plural for real.
// The base host without a compiler THROWS E_ICU_SYNTAX on the very template
// below, so the assertions fail loudly if the re-export hop ever drops the
// compiler instead of shipping it.
//
// `<T>` rendering needs a DOM and is NOT exercised here. No top-level await:
// the webpack leg emits commonjs2.
import { createI18n, I18nProvider, icuCompiler, useI18n } from "@comvi/next/client";

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
assert(typeof createI18n === "function", "@comvi/next/client exports createI18n");
assert(typeof useI18n === "function", "@comvi/next/client exports useI18n");
assert(isComponent(I18nProvider), "@comvi/next/client exports I18nProvider");
assert(
  icuCompiler !== null && typeof icuCompiler === "object",
  "@comvi/next/client exports icuCompiler from core's pure /icu subpath",
);

// INLINE catalogs take the constructor option: the compiler must be in place
// before the translation passed here is ingested. `.with(icu())` is the form for
// a catalog that arrives later, and it is measured in core, not per wrapper.
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

// The bought capability, proved positively: both plural branches select, and
// `#` resolves to the count. Without `icuCompiler` this template throws.
assertEqual(i18n.t("items", { count: 1 }), "1 item", "ICU plural selects the `one` branch");
assertEqual(i18n.t("items", { count: 5 }), "5 items", "ICU plural selects the `other` branch");

// The capabilities this row does NOT buy — the behavioral mirror of the runner's
// module-graph absences.
assert(typeof i18n.reloadTranslations === "undefined", "ICU client host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "ICU client host has no plugin capability");
assert(typeof i18n.instanceId === "undefined", "ICU client host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without an explicit /tags import",
);

console.log("BUNDLER_MATRIX_OK next-client-icu");
