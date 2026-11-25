import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCEPTED_VS_07, accepted, acceptedReason, regressions, renderCompare } from "./perf.mjs";

const THRESHOLD = 5;
const result = (name, deltaPct) => ({
  name,
  deltaPct,
  deltaMinPct: deltaPct,
  a: 1,
  b: 1 + deltaPct / 100,
  aMedian: 1,
  bMedian: 1 + deltaPct / 100,
});
const RESULTS = [
  result("constructor (200-key catalog)", 73.36),
  result("formatNumber", 6.29),
  result("t() static key", 12),
  result("rich text <b>", -19.39),
];
const names = (results) => results.map((r) => r.name);

test("against a 0.7 reference the listed cases are accepted, any other flagged case is new", () => {
  assert.deepEqual(names(accepted(RESULTS, THRESHOLD, "0.7")), [
    "constructor (200-key catalog)",
    "formatNumber",
  ]);
  assert.deepEqual(names(regressions(RESULTS, THRESHOLD, "0.7")), ["t() static key"]);
});

test("against a 0.8 reference nothing is accepted: the same slowdowns are flagged as new", () => {
  assert.deepEqual(names(accepted(RESULTS, THRESHOLD, "0.8")), []);
  assert.deepEqual(names(regressions(RESULTS, THRESHOLD, "0.8")), [
    "constructor (200-key catalog)",
    "formatNumber",
    "t() static key",
  ]);
});

test("a reference of no known generation accepts nothing", () => {
  assert.deepEqual(names(accepted(RESULTS, THRESHOLD, undefined)), []);
  assert.equal(regressions(RESULTS, THRESHOLD, undefined).length, 3);
});

test("a listed case under the threshold is neither accepted nor flagged", () => {
  const quiet = [result("constructor (200-key catalog)", 4.9)];
  assert.deepEqual(accepted(quiet, THRESHOLD, "0.7"), []);
  assert.deepEqual(regressions(quiet, THRESHOLD, "0.7"), []);
});

test("the table marks a case by the reference's generation", () => {
  const line = (generation) =>
    renderCompare(RESULTS, THRESHOLD, generation)
      .split("\n")
      .find((row) => row.includes("constructor (200-key catalog)"));
  assert.match(line("0.7"), /<-- accepted vs 0\.7/);
  assert.match(line("0.8"), /<-- flagged/);
  assert.doesNotMatch(line("0.8"), /accepted/);
});

test("the constructor's accepted delta names its base, the decision and the cost", () => {
  const reason = acceptedReason("constructor (200-key catalog)", "0.7");
  assert.equal(reason, ACCEPTED_VS_07["constructor (200-key catalog)"]);
  assert.match(reason, /owner 25\.11\.2026/);
  assert.match(reason, /v0\.7\.1/);
  assert.equal(acceptedReason("constructor (200-key catalog)", "0.8"), undefined);
});
