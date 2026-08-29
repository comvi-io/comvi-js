import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import url from "node:url";
import { spawnSync } from "node:child_process";
import { DEFAULT_THRESHOLD_PCT, median, regressions, renderCompare } from "./perf.mjs";

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const PERF = path.join(SCRIPT_DIR, "perf.mjs");
const REAL_DIST = path.join(SCRIPT_DIR, "..", "packages", "core", "dist");

/**
 * Spelled out rather than imported from perf.mjs: the gate's value is that this
 * exact set is measured, so a renamed or dropped case must fail here.
 */
const CASE_NAMES = [
  "constructor (200-key catalog)",
  "t() static key",
  "t() with {name}",
  "t() ICU plural (icuCompiler)",
  "prepareTranslation(<b>)",
];

function runPerf(args) {
  return spawnSync(process.execPath, [PERF, ...args], { encoding: "utf8" });
}

/**
 * A second dist root that is REALLY slower: it re-exports the built core and
 * wraps `createI18n` in a busy loop. Nothing in perf.mjs knows about it — the
 * gate measures a genuinely slower constructor, which is the only honest way to
 * prove the threshold fires.
 */
function makeSlowDist(root, busyIterations) {
  const dist = path.join(root, "slow-dist");
  fs.mkdirSync(dist, { recursive: true });
  const real = (file) => JSON.stringify(url.pathToFileURL(path.join(REAL_DIST, file)).href);
  fs.writeFileSync(
    path.join(dist, "comvi-core.js"),
    // The explicit local `createI18n` shadows the one `export *` would re-export.
    `export * from ${real("comvi-core.js")};\n` +
      `import { createI18n as realCreateI18n } from ${real("comvi-core.js")};\n` +
      `export function createI18n(options) {\n` +
      `  let sum = 0;\n` +
      `  for (let i = 0; i < ${busyIterations}; i++) sum += i % 7;\n` +
      `  if (sum === -1) throw new Error("unreachable");\n` +
      `  return realCreateI18n(options);\n` +
      `}\n`,
  );
  for (const file of ["comvi-core-icu.js", "comvi-core-rich-text.js"]) {
    fs.writeFileSync(path.join(dist, file), `export * from ${real(file)};\n`);
  }
  return dist;
}

test("single mode reports every case with a median and a JSON line", () => {
  const result = runPerf([REAL_DIST]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    CASE_NAMES.filter((name) => !result.stdout.includes(name)),
    [],
    `cases missing from the human report:\n${result.stdout}`,
  );

  const json = JSON.parse(result.stdout.trim().split("\n").pop());

  assert.deepEqual(Object.keys(json), CASE_NAMES);
  assert.deepEqual(
    Object.entries(json).filter(([, median]) => !(median > 0)),
    [],
    "every case must report a positive median",
  );
});

test("compare mode exits 1 on a real slowdown in B", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perf-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // ~20k trivial iterations lands well above the 5 % threshold against a ~29 µs
  // constructor without making the test slow.
  const slow = makeSlowDist(root, 20_000);

  const result = runPerf(["--compare", REAL_DIST, slow, "--repetitions", "2"]);
  assert.equal(result.status, 1, `expected a failing exit\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Perf gate failed/);
  assert.match(result.stderr, /constructor \(200-key catalog\)/);
  assert.match(result.stdout, /REGRESSION/);

  // Only construction was slowed; the warm t() paths must not be blamed.
  const deltas = JSON.parse(
    result.stdout
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .pop(),
  );
  assert.ok(
    deltas["constructor (200-key catalog)"] > DEFAULT_THRESHOLD_PCT,
    `constructor Δ was ${deltas["constructor (200-key catalog)"]}%`,
  );
  assert.ok(
    deltas["t() static key"] < DEFAULT_THRESHOLD_PCT,
    `t() static key Δ was ${deltas["t() static key"]}%`,
  );
});

test("compare mode exits 0 when both roots are the same dist", () => {
  // The gate must not fire on identical inputs. Asserted at 20 % rather than the
  // production 5 %: the measured noise floor of this protocol is ~3.5 % on a
  // loaded machine, and a unit test that
  // depends on a busy CI runner staying quiet is a flake, not a gate.
  const result = runPerf([
    "--compare",
    REAL_DIST,
    REAL_DIST,
    "--repetitions",
    "2",
    "--threshold",
    "20",
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Perf gate passed/);
  assert.doesNotMatch(result.stdout, /REGRESSION/);
});

test("--threshold overrides the default", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perf-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const slow = makeSlowDist(root, 20_000);
  // The same slowdown that fails at 5 % passes when the caller allows 1000 %.
  const result = runPerf([
    "--compare",
    REAL_DIST,
    slow,
    "--repetitions",
    "1",
    "--threshold",
    "1000",
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("compare mode fails loudly when a dist root has no core build", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perf-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = runPerf(["--compare", REAL_DIST, root, "--repetitions", "1"]);
  // Exit 1, not merely non-zero: exit 2 is the usage path, so `notEqual(0)` would
  // also pass if the flags stopped parsing.
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /perf worker failed/);
});

test("--probe passes on a complete dist and reports what an incomplete one lacks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perf-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const complete = runPerf(["--probe", REAL_DIST]);
  assert.equal(complete.status, 0, complete.stderr);

  // Exit 3, not 1: CI has to tell "the reference build cannot be compared"
  // apart from "the candidate regressed".
  const incomplete = runPerf(["--probe", root]);
  assert.equal(incomplete.status, 3);
  assert.match(incomplete.stderr, /comvi-core\.js/);
});

test("median takes the middle of an odd sample and the mean of an even one", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("regressions counts only slowdowns beyond the threshold", () => {
  const results = [
    { name: "faster", deltaPct: -9 },
    { name: "noise", deltaPct: 4.9 },
    { name: "regressed", deltaPct: 5.1 },
  ];
  assert.deepEqual(
    regressions(results, DEFAULT_THRESHOLD_PCT).map((result) => result.name),
    ["regressed"],
  );
});

test("renderCompare marks the regressed row and only that row", () => {
  const rendered = renderCompare(
    [
      { name: "ok", a: 1, b: 1.02, deltaPct: 2 },
      { name: "bad", a: 1, b: 1.4, deltaPct: 40 },
    ],
    DEFAULT_THRESHOLD_PCT,
  );
  const marked = rendered.split("\n").filter((line) => line.includes("REGRESSION"));
  assert.equal(marked.length, 1);
  assert.match(marked[0], /bad/);
});
