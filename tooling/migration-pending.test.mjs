// MIGRATION_PENDING shard selection: a multi-shard gate (examples e2e, test-apps smoke,
// bundler matrix) must cover a framework again as soon as ITS needs are active, even
// while other frameworks stay pending.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeShards,
  EXAMPLES_E2E_MATRIX,
  exampleNeeds,
  MIGRATION_PENDING,
  PENDING_CAPABILITIES,
  TEST_APPS,
  testAppNeeds,
} from "./migration-pending.mjs";

/** Runs `fn` with `names` removed from the pending lists, then restores them. */
function landed(names, fn) {
  const saved = [];
  for (const name of names) {
    for (const list of [MIGRATION_PENDING, PENDING_CAPABILITIES]) {
      if (name in list) {
        saved.push([list, name, list[name]]);
        delete list[name];
      }
    }
  }
  try {
    return fn();
  } finally {
    for (const [list, name, reason] of saved) list[name] = reason;
  }
}

const quiet = () => {};
const activeExamples = () =>
  EXAMPLES_E2E_MATRIX.filter(
    (e) => activeShards([e.framework], exampleNeeds, "examples-e2e", quiet).length === 1,
  ).map((e) => `${e.framework}/${e.mode}`);

test("today every example and test app is pending, and the skip says why", () => {
  assert.deepEqual(activeExamples(), []);
  const lines = [];
  assert.deepEqual(
    activeShards(TEST_APPS, testAppNeeds, "test-apps-smoke", (l) => lines.push(l)),
    [],
  );
  assert.ok(lines.some((l) => l.includes("fixtures-08") && l.includes("lot 1c")));
});

test("React landing re-enables the React shards while Vue, Next and the rest stay pending", () => {
  const got = landed(
    ["fixtures-08", "@comvi/react", "@comvi/plugin-fetch-loader", "@comvi/plugin-locale-detector"],
    activeExamples,
  );
  assert.deepEqual(got, ["react/default", "react/cdn", "vanilla/default", "vanilla/cdn"]);
});

test("a test app runs once it and the core instance are active, independently of the others", () => {
  const got = landed(["fixtures-08", "@test-apps/next16"], () =>
    activeShards(TEST_APPS, testAppNeeds, "test-apps-smoke", quiet),
  );
  assert.deepEqual(got, ["next16"]);
});

test("example needs come from the example's own package.json", () => {
  assert.deepEqual(exampleNeeds("sveltekit").sort(), [
    "@comvi/core",
    "@comvi/svelte",
    "fixtures-08",
  ]);
});
