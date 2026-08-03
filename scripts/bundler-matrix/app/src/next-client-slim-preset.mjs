// framework-slim DX gate: the SINGLE-PACKAGE Next.js CLIENT recipe. Every
// specifier in this file is `@comvi/next/client` — no `@comvi/core` anywhere.
//
// `@comvi/next/client` is not a `/slim` entry: its published `createI18n` is
// the ROOT constructor and stays that way, so the slim host is `createSlimI18n`.
// Both names are exported side by side, and this case pins the consequence —
// an app that only ever calls `createSlimI18n` does not carry the root entry,
// in ANY bundler or mode.
//
// The other half of the gate is the re-export hop: `@comvi/next/client`
// re-exports five capability bindings from core's pure subpaths; this app uses
// one. The runner asserts the other three subpaths never enter the graph.
//
// Tag interpolation is deliberately not asserted here: `@comvi/next/client`
// re-exports `T` from `@comvi/react`, so webpack development keeps core's tag
// registration alive (see the `next-client-slim` note in run.mjs). Rendering
// needs a DOM and is NOT exercised.
import {
  attachLoader,
  createSlimI18n,
  flattenCatalog,
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
assert(typeof createSlimI18n === "function", "@comvi/next/client exports createSlimI18n");
assert(typeof useI18n === "function", "@comvi/next/client exports useI18n");
assert(isComponent(I18nProvider), "@comvi/next/client exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/next/client re-exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/next/client re-exports useI18nPlugins");
assert(typeof attachLoader === "function", "@comvi/next/client re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/next/client re-exports flattenCatalog");

const i18n = createSlimI18n({ locale: "en", exposeGlobal: false });

// The hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations({ "en:default": { msg: "hydrated" } });

assert(typeof i18n.reloadTranslations === "undefined", "createSlimI18n builds a BARE slim host");
assert(typeof i18n.onMissingKey === "undefined", "createSlimI18n builds a BARE slim host");
assertEqual(i18n.t("msg"), "hydrated", "the hydrated catalog is readable on the client");

attachLoader(i18n);
assert(typeof i18n.reloadTranslations === "function", "attachLoader composes the loader API");
assert(typeof i18n.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
assertEqual(
  JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
  JSON.stringify({ "nav.home": "Home" }),
  "flattenCatalog is core's flattener",
);

console.log("BUNDLER_MATRIX_OK next-client-slim-preset");
