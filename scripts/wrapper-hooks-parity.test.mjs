// B8 — the four framework wrappers ship the SAME capability-acquisition code.
//
// `@comvi/react`, `@comvi/vue`, `@comvi/solid` and `@comvi/svelte` each own a
// copy of the loader/plugin-host acquisition: the two return-shape interfaces,
// the per-host `WeakMap` bags, and the `hasLoaderApi` / `hasPluginHostApi`
// guards that turn a missing capability into `missingCapability(...)`. Copies
// drift, and this one had: react wrapped the `onMissingKey` callback in a
// `String(result)` coercion the other three did not have, silently narrowing
// core's `TranslationResult | void` return to a string in one framework only.
//
// The code cannot live in one place today — a wrapper importing another
// wrapper would be a cross-framework dependency, and `@comvi/core` is off
// limits this phase — so the copies are pinned instead: each file carries the
// block verbatim between `#region capability-parity (B8)` markers, and this
// test fails the release if any byte differs.
//
// PHASE 3: move the block into `@comvi/core` (every wrapper already imports it)
// as `acquireLoaderApi(host: WrapperI18nHost)` / `acquirePluginsApi(host:
// WrapperI18nHost)`, delete the four copies, and delete this file with them.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const START = "// #region capability-parity (B8)";
const END = "// #endregion capability-parity (B8)";

/** The four copies, by the package whose behaviour each one defines. */
const WRAPPERS = {
  "@comvi/react": "packages/react/src/capabilityHooks.ts",
  "@comvi/vue": "packages/vue/src/composables/capabilities.ts",
  "@comvi/solid": "packages/solid/src/capabilityHooks.ts",
  "@comvi/svelte": "packages/svelte/src/capabilities.ts",
};

/**
 * The `@comvi/core` imports the shared block depends on. Pinned separately
 * because imports must sit at the top of a module, outside the region: a
 * wrapper that kept the block but imported a different guard would still be
 * drift.
 */
const REQUIRED_IMPORTS = [
  'import { hasLoaderApi, hasPluginHostApi, missingCapability } from "@comvi/core";',
  'import type { I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";',
];

function readWrapper(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** Extract the marked region, markers included. */
export function extractSharedBlock(source, relativePath) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);

  assert.notEqual(start, -1, `${relativePath}: missing "${START}"`);
  assert.notEqual(end, -1, `${relativePath}: missing "${END}"`);
  assert.ok(start < end, `${relativePath}: region markers are out of order`);
  assert.equal(
    source.indexOf(START, start + START.length),
    -1,
    `${relativePath}: more than one region start`,
  );

  return source.slice(start, end + END.length);
}

/**
 * Drop comments so a prose mention of a banned pattern (this file's own region
 * header names `String(result)`) cannot masquerade as code.
 */
function stripComments(block) {
  return block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

test("all four wrappers carry the capability-parity block byte for byte", () => {
  const entries = Object.entries(WRAPPERS).map(([pkg, relativePath]) => [
    pkg,
    relativePath,
    extractSharedBlock(readWrapper(relativePath), relativePath),
  ]);

  const [referencePkg, referencePath, reference] = entries[0];
  assert.ok(reference.length > 0, `${referencePath}: empty region`);

  for (const [pkg, relativePath, block] of entries.slice(1)) {
    assert.equal(
      block,
      reference,
      `${pkg} (${relativePath}) drifted from ${referencePkg} (${referencePath}). ` +
        "Re-sync the #region capability-parity (B8) block: it must be identical in all four wrappers.",
    );
  }
});

test("the shared block defines the whole acquisition, not a fragment of it", () => {
  const block = extractSharedBlock(readWrapper(WRAPPERS["@comvi/react"]), WRAPPERS["@comvi/react"]);

  for (const needle of [
    "export interface UseI18nLoaderReturn",
    "export interface UseI18nPluginsReturn",
    "const loaderBags = new WeakMap<AnyHost, UseI18nLoaderReturn>();",
    "const pluginBags = new WeakMap<AnyHost, UseI18nPluginsReturn>();",
    "function acquireLoader(host: AnyHost): UseI18nLoaderReturn {",
    "function acquirePlugins(host: AnyHost): UseI18nPluginsReturn {",
    'if (!hasLoaderApi(host)) throw missingCapability("loader");',
    'if (!hasPluginHostApi(host)) throw missingCapability("plugins");',
    "onMissingKey: host.onMissingKey.bind(host),",
  ]) {
    assert.ok(block.includes(needle), `the shared block must contain: ${needle}`);
  }
});

test("onMissingKey is core's type and core's method, with no wrapper-side coercion", () => {
  // The exact drift B8 was filed for. `onMissingKey` must be the BOUND HOST
  // METHOD and its declared type must be core's, so a callback returning the
  // `Array<string | VirtualNode>` half of `TranslationResult` survives.
  for (const [pkg, relativePath] of Object.entries(WRAPPERS)) {
    const block = extractSharedBlock(readWrapper(relativePath), relativePath);

    assert.ok(
      block.includes('onMissingKey: I18nPluginHostApi["onMissingKey"];'),
      `${pkg}: onMissingKey must be typed as I18nPluginHostApi["onMissingKey"]`,
    );
    assert.ok(
      !/String\s*\(/.test(stripComments(block)),
      `${pkg}: the shared block must not coerce a callback result (String(...))`,
    );
  }
});

test("every wrapper imports the guards the shared block calls", () => {
  for (const [pkg, relativePath] of Object.entries(WRAPPERS)) {
    const source = readWrapper(relativePath);

    for (const line of REQUIRED_IMPORTS) {
      assert.ok(source.includes(line), `${pkg} (${relativePath}) must import:\n  ${line}`);
    }
  }
});
