// Single-entry P4 gate: THE DEFAULT Next.js CLIENT recipe. Every import in this
// file comes from `@comvi/next/client`; `@comvi/core` is never named by the app.
//
// This case RETARGETS the former `next-client-slim-preset` and ABSORBS the
// former `next-client-slim`: that second app named `@comvi/core` for its
// constructor, which this entry's `createI18n` now IS, so the two cases built
// one graph through two specifiers. `@comvi/next/client` is not a `/slim` entry
// — it is next's only client surface, its `createI18n` is the published 0.4.x
// name, and after the convergence that name denotes the BASE host. (The retired
// second constructor name's absence is pinned from source, in
// packages/next/tests/entry-surfaces.test.tsx and the type tests: a namespace
// import here would keep every re-export of this entry live and defeat the very
// absences this case exists to assert.)
//
// Like `react-default`, this app deliberately uses NO capability: the runner
// asserts from the bundlers' module graphs that ICU, loader, plugins, devtools,
// core's tag-registration pair AND next's server modules all stay out, in
// development as well as production. Core's BASE entry is present — its
// `createI18n` is what this app constructs with — so it is never an absence
// sentinel. The "one capability in, the other three out" half of the re-export
// gate is `next-client-icu` on this entry and `next-server-on-default` on the
// server one.
//
// Tag interpolation is asserted BEHAVIOURALLY here (markup stays literal);
// rendering `<T>` needs a DOM and is NOT exercised.
import {
  createI18n,
  I18nProvider,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/next/client";

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
assert(typeof useI18nLoader === "function", "@comvi/next/client re-exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/next/client re-exports useI18nPlugins");

const i18n = createI18n({ locale: "en", exposeGlobal: false });

// The hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations({ "en:default": { msg: "a <b>c</b> d" } });

assert(typeof i18n.reloadTranslations === "undefined", "default client host has no loader");
assert(typeof i18n.onMissingKey === "undefined", "default client host has no plugin host");
assert(typeof i18n.instanceId === "undefined", "default client host has no devtools discovery");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without an explicit /tags import",
);

console.log("BUNDLER_MATRIX_OK next-client-default");
