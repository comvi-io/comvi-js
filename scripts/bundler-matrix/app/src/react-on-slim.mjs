// framework-slim gate (plan P0.5): a react app on a BARE SLIM host.
//
// PENDING until Phase 2 retargets @comvi/react's value imports to
// `@comvi/core/slim`. Until then the wrapper keeps the root entry — and its
// side-effectful register-tags chunk — alive, so the runner's sentinel
// assertion (tag modules ABSENT from the bundler's module graph) cannot pass.
//
// <T> rendering itself needs a DOM/renderer and is NOT exercised here (same
// documented skip as wrappers.mjs). What this fixture pins at runtime:
//   - the bare-slim host really lacks the loader/plugin capability members,
//     so a wrapper that eagerly binds them would crash here;
//   - without a /tags import, tag markup stays literal text.
import { createI18n } from "@comvi/core/slim";
import { I18nProvider, useI18n } from "@comvi/react";

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
assert(typeof useI18n === "function", "@comvi/react exports useI18n");
assert(isComponent(I18nProvider), "@comvi/react exports I18nProvider");

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

console.log("BUNDLER_MATRIX_OK react-on-slim");
