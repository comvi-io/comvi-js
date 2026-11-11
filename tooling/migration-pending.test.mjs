// MIGRATION_PENDING shard selection: a multi-shard gate (examples e2e, test-apps smoke,
// bundler matrix) must cover a framework again as soon as ITS needs are active, even
// while other frameworks stay pending.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeShards,
  EXAMPLES_E2E_MATRIX,
  bundlerCaseNeeds,
  exampleNeeds,
  MIGRATION_PENDING,
  TEST_APPS,
  testAppNeeds,
} from "./migration-pending.mjs";

/** Runs `fn` with `names` added to MIGRATION_PENDING, then removes them. */
function pendingFor(names, fn) {
  for (const name of names) MIGRATION_PENDING[name] = "a test";
  try {
    return fn();
  } finally {
    for (const name of names) delete MIGRATION_PENDING[name];
  }
}

const quiet = () => {};
const activeExamples = () =>
  EXAMPLES_E2E_MATRIX.filter(
    (e) => activeShards([e.framework], exampleNeeds, "examples-e2e", quiet).length === 1,
  ).map((e) => `${e.framework}/${e.mode}`);

test("after lot 7 every example, both SSR recipes and every test app run", () => {
  assert.deepEqual(activeExamples(), [
    "react/default",
    "react/cdn",
    "next/default",
    "next/cdn",
    "vue/default",
    "vue/cdn",
    "nuxt/default",
    "nuxt/cdn",
    "svelte/default",
    "svelte/cdn",
    "solid/default",
    "solid/cdn",
    "vanilla/default",
    "vanilla/cdn",
    "sveltekit/default",
    "solidstart/default",
  ]);
  assert.deepEqual(activeShards(TEST_APPS, testAppNeeds, "test-apps-smoke", quiet), [
    "next",
    "next16",
    "nuxt",
    "nuxt4",
  ]);
});

test("a rewritten example or bundler case does not need fixtures-08; the others do", () => {
  assert.deepEqual(exampleNeeds("react").sort(), ["@comvi/core", "@comvi/react"]);
  assert.deepEqual(bundlerCaseNeeds("react-default", ["@comvi/core"]), ["@comvi/core"]);
  assert.deepEqual(bundlerCaseNeeds("vue-default", ["@comvi/vue"]), ["@comvi/vue"]);
  assert.deepEqual(bundlerCaseNeeds("next-client-default", ["@comvi/next"]), ["@comvi/next"]);
  assert.deepEqual(bundlerCaseNeeds("editor-production", ["@comvi/plugin-in-context-editor"]), [
    "fixtures-08",
    "@comvi/plugin-in-context-editor",
  ]);
});

test("a test app runs once it is active, independently of the others", () => {
  const lines = [];
  const got = pendingFor(["@test-apps/nuxt"], () =>
    activeShards(TEST_APPS, testAppNeeds, "test-apps-smoke", (l) => lines.push(l)),
  );
  assert.deepEqual(got, ["next", "next16", "nuxt4"]);
  assert.ok(lines.some((l) => l.includes("@test-apps/nuxt is MIGRATION_PENDING")));
});

test("example needs come from the example's own package.json", () => {
  assert.deepEqual(exampleNeeds("sveltekit").sort(), ["@comvi/core", "@comvi/svelte"]);
});
