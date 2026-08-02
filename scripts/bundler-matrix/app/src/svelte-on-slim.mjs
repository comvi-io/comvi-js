// framework-slim gate (plan P0.5): a svelte app on a BARE SLIM host.
//
// PENDING until Phase 3 retargets @comvi/svelte's value imports to
// `@comvi/core/slim` AND relocates the eager capability `.bind()`s — svelte is
// the wrapper that crashes at bind time on a bare-slim host today, so this
// fixture is also the regression pin for that fix.
//
// <T> rendering needs a renderer and is NOT exercised here. What this fixture
// pins at runtime: the bare-slim host lacks the capability members, and tag
// markup stays literal without a /tags import.
import { createI18n } from "@comvi/core/slim";
import { getI18nContext, useI18n } from "@comvi/svelte";

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

assert(typeof useI18n === "function", "@comvi/svelte exports useI18n");
assert(typeof getI18nContext === "function", "@comvi/svelte exports getI18nContext");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { msg: "a <b>c</b> d" } },
});

assert(typeof i18n.reloadTranslations === "undefined", "bare slim host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "bare slim host has no plugin capability");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without a /tags import",
);

console.log("BUNDLER_MATRIX_OK svelte-on-slim");
