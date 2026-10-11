// THE DEFAULT solid recipe. Every import comes from `@comvi/solid`;
// `@comvi/core` is never named by the app, which uses NO capability — the runner
// asserts from the bundlers' module graphs that ICU, loader, plugins, devtools
// and core's tag-registration pair all stay out. Core's BASE entry is present —
// its `createI18n` is what this app constructs with — so it is never an absence
// sentinel.
//
// `useI18nLoader` / `useI18nPlugins` are deliberately NOT named here, unlike in
// the capability cases. Since the acquisition moved into `@comvi/core` the two
// hooks ARE the capability subpaths — `acquireLoaderApi` lives on
// `@comvi/core/loader`, `acquirePluginsApi` on `@comvi/core/plugins` — so merely
// referencing one pulls the module this case asserts absent. The export surface
// they used to pin here is pinned by the packages' own SOURCE entry tests, which
// CALL them through `src/index` rather than through the published root.
//
// It is also a regression pin: the base host really lacks the loader/plugin
// capability members, so a wrapper that bound them eagerly would crash here.
//
// <T> rendering needs a DOM and is NOT exercised here. No top-level await: the
// webpack leg emits commonjs2.
import { createI18n, I18nProvider, useI18n } from "@comvi/solid";

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
assert(typeof createI18n === "function", "@comvi/solid exports createI18n");
assert(typeof useI18n === "function", "@comvi/solid exports useI18n");
assert(isComponent(I18nProvider), "@comvi/solid exports I18nProvider");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  messages: { en: { msg: "a <b>c</b> d" } },
});

// `I18n` is a TYPE from a binding root (P5), so the pin is structural: a base
// core host, with the composition verb and no capability attached.
assert(
  typeof i18n.t === "function" && typeof i18n.use === "function",
  "createI18n builds a core host",
);
assert(typeof i18n.reloadMessages === "undefined", "default host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "default host has no plugin capability");
assert(typeof i18n.instanceId === "undefined", "default host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without <T>",
);

console.log("BUNDLER_MATRIX_OK solid-default");
