// framework-slim gate (plan P0.5, ACTIVATED in P3): a svelte app on a BARE
// SLIM host.
//
// This is also the regression pin for the wrapper that crashed at BIND time:
// before 0.5.0 `useI18n()` eagerly `.bind()`-ed four capability members that
// a bare-slim host does not have.
//
// <T> rendering needs a renderer and is NOT exercised here. What this fixture
// pins at runtime:
//   - the bare-slim host really lacks the loader/plugin capability members;
//   - the D′ acquisition readers are exported alongside `useI18n`;
//   - without a /tags import, tag markup stays literal text.
// The runner additionally asserts core's tag-registration chunks are ABSENT
// from the bundler's module graph — svelte-package already emits T.svelte as
// its own dist module, so the entry's re-export is a prunable named binding
// under `sideEffects: false`.
import { createI18n } from "@comvi/core";
import { getI18nContext, useI18n, useI18nLoader, useI18nPlugins } from "@comvi/svelte";

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
assert(typeof useI18nLoader === "function", "@comvi/svelte exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/svelte exports useI18nPlugins");

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
