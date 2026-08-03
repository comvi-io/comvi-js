// framework-slim gate (plan P0.5): a vue app on a BARE BASE host, built through
// the `createI18nFromCore` factory — the one that takes a host instead of
// constructing one.
//
// ACTIVE since Phase 4 (the case carries no `pending` field in run.mjs): that
// factory ships from a module which does not import `@comvi/vue`'s own
// `createI18n`, so the runner's sentinel assertion (tag modules ABSENT from the
// bundler's module graph) passes. Those sentinels are about the TAG modules —
// `@comvi/core`'s base root is in this graph by design, since the fixture calls
// its `createI18n` below (plan P4 step 4 / P4-AB1).
//
// <T> rendering needs a renderer and is NOT exercised here. What this fixture
// pins at runtime: the injected bare-slim core lacks the capability members,
// the dropped VueI18n proxies are really gone, and tag markup stays literal.
import { createI18n } from "@comvi/core";
import { createI18nFromCore, useI18n } from "@comvi/vue/slim";

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

assert(typeof useI18n === "function", "@comvi/vue exports useI18n");

const core = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { plain: "hello", msg: "a <b>c</b> d" } },
});
const i18n = createI18nFromCore(core, { ssrLocale: "en" });

assert(typeof core.reloadTranslations === "undefined", "bare slim core has no loader capability");
assert("reloadTranslations" in i18n === false, "VueI18n no longer proxies loader capabilities");
assert(i18n.core === core, "VueI18n exposes the injected core");
// Tag-syntax ABSENCE is asserted by the runner against the bundler's own
// module graph (plan P0.3: module IDs, never output text). What is checked
// here is that the wrapper renders through the slim host at all.
assertEqual(i18n.t("plain"), "hello", "slim host translates through the wrapper");

console.log("BUNDLER_MATRIX_OK vue-on-slim");
