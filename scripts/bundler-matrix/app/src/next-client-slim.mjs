// framework-slim gate (plan P5 step 2, advisory refinement): the Next.js
// CLIENT recipe — a bare `@comvi/core` host hydrated from the catalog the
// server serialized, on react's D′ surface re-exported by `@comvi/next/client`.
//
// The runner asserts from the bundler's module graph that this bundle contains
// NEITHER the server host module (`createNextI18nFromHost`, and with it the
// once-cell and `_resetServerI18n`) NOR any loader code — core's or next's.
// Rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs / react-on-slim.mjs), and tag interpolation is deliberately not
// asserted: `@comvi/next/client` re-exports `T`, so webpack's development mode
// keeps core's tag registration alive (see the case's note in run.mjs). The
// tag-free claim for a next client app is made by `fw-next-client-slim` in
// scripts/size-budgets.json and by `react-on-slim` here.
import { createI18n } from "@comvi/core";
import { I18nProvider, useI18n, useI18nLoader, useI18nPlugins } from "@comvi/next/client";

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
assert(typeof useI18n === "function", "@comvi/next/client exports useI18n");
assert(isComponent(I18nProvider), "@comvi/next/client exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/next/client re-exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/next/client re-exports useI18nPlugins");

const i18n = createI18n({ locale: "en", exposeGlobal: false });

// The hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations({ "en:default": { msg: "hydrated" } });

assert(typeof i18n.reloadTranslations === "undefined", "bare slim host has no loader capability");
assert(typeof i18n.onMissingKey === "undefined", "bare slim host has no plugin capability");
assertEqual(i18n.t("msg"), "hydrated", "the hydrated catalog is readable on the client");

console.log("BUNDLER_MATRIX_OK next-client-slim");
