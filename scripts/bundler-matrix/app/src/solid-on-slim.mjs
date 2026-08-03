// framework-slim gate (plan P0.5, ACTIVATED in P3): a solid app on a BARE
// SLIM host.
//
// <T> rendering itself needs a DOM/renderer and is NOT exercised here (same
// documented skip as wrappers.mjs). What this fixture pins at runtime:
//   - the bare-slim host really lacks the loader/plugin capability members,
//     so a wrapper that eagerly binds them would crash here;
//   - the D′ acquisition hooks are exported alongside `useI18n`;
//   - without a /tags import, tag markup stays literal text.
// The runner additionally asserts core's tag-registration chunks are ABSENT
// from the bundler's module graph — only reachable because <T> now lives in
// its own dist chunk (fs-p1 blocker B1).
import { createI18n } from "@comvi/core";
import { I18nProvider, useI18n, useI18nLoader, useI18nPlugins } from "@comvi/solid";

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
assert(typeof useI18n === "function", "@comvi/solid exports useI18n");
assert(isComponent(I18nProvider), "@comvi/solid exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/solid exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/solid exports useI18nPlugins");

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

console.log("BUNDLER_MATRIX_OK solid-on-slim");
