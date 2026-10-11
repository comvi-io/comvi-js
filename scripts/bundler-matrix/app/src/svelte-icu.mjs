// The default svelte recipe plus EXACTLY ONE capability, every import from
// `@comvi/svelte` — `icuCompiler` included, which is the point of the
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
// <T> rendering needs a DOM and is NOT exercised here, and not importing `T`
// keeps the webpack leg — which has no svelte loader — able to prune `T.svelte`
// without resolving it.
import { createI18n, icuCompiler, setI18nContext, useI18n } from "@comvi/svelte";

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
assert(typeof useI18n === "function", "@comvi/svelte exports useI18n");
assert(typeof setI18nContext === "function", "@comvi/svelte exports setI18nContext");
assert(
  icuCompiler !== null && typeof icuCompiler === "object",
  "@comvi/svelte exports icuCompiler from core's pure /icu subpath",
);

// ICU is the constructor option, whatever the catalog source: the compiler has
// to be in place before the translation passed here is ingested, and the option
// is read in the constructor, so remote catalogs enable it the same way.
const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  compiler: icuCompiler,
  messages: {
    en: {
      items: "{count, plural, one {# item} other {# items}}",
      msg: "a <b>c</b> d",
    },
  },
});

// `I18n` is a TYPE from a binding root (P5), so the pin is structural: a base
// core host, with the composition verb and no capability attached.
assert(
  typeof i18n.t === "function" && typeof i18n.use === "function",
  "createI18n builds a core host",
);

// The bought capability, proved positively: both plural branches select, and
// `#` resolves to the count. Without `icuCompiler` this template throws.
assertEqual(i18n.t("items", { count: 1 }), "1 item", "ICU plural selects the `one` branch");
assertEqual(i18n.t("items", { count: 5 }), "5 items", "ICU plural selects the `other` branch");

// The capabilities this row does NOT buy — the behavioral mirror of the
// runner's module-graph absences.
assert(typeof i18n.reloadMessages === "undefined", "ICU host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "ICU host has no plugin capability");
assert(typeof i18n.instanceId === "undefined", "ICU host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T>",
);

console.log("BUNDLER_MATRIX_OK svelte-icu");
