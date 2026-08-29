import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

/**
 * Runtime perf gate for `@comvi/core`.
 *
 * Five fixed cases over a fixed 200-key catalog: construction, `t()` on a static
 * key, `t()` with a `{name}` param, `t()` on an ICU plural through `icuCompiler`,
 * and `prepareTranslation` over a `<b>` rich-text seam. Every case gets a 2000-call
 * warm-up, then N timed runs; the reported figure is the MEDIAN µs/op.
 *
 *   node scripts/perf.mjs [distRoot]
 *     Prints the table plus a JSON line for one dist (default:
 *     packages/core/dist).
 *
 *   node scripts/perf.mjs --probe <distRoot>
 *     Exits 0 when that dist exposes every entry the protocol loads, 3 when it
 *     does not — so CI can distinguish an incomparable reference build from a
 *     passing comparison.
 *
 *   node scripts/perf.mjs --compare <distRootA> <distRootB> [--threshold <pct>] [--repetitions <n>]
 *     Interleaved A/B: for each repetition it measures A then B for every case,
 *     three times, and keeps the MIN per side (the least-disturbed run — a
 *     benchmark's noise is one-sided). Prints Δ% per case and exits 1 when any
 *     case regresses by more than the threshold (default 5 %).
 *     A is the reference (main), B the candidate (PR head).
 *
 * Every individual measurement runs in its own child process (`--measure-one`),
 * so a compare run never has two copies of core resident in one isolate — call
 * sites stay monomorphic and compare-mode numbers are directly comparable to
 * single-mode ones. Absolute numbers are machine-local; only the Δ is portable.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DIST = path.join(REPO_ROOT, "packages", "core", "dist");

export const DEFAULT_THRESHOLD_PCT = 5;
const WARMUP_CALLS = 2000;
const SINGLE_MODE_RUNS = 5;
const COMPARE_REPETITIONS = 3;

/** Case list, in report order. `iters` is per timed run. */
export const CASES = [
  { name: "constructor (200-key catalog)", iters: 10_000 },
  { name: "t() static key", iters: 2_000_000 },
  { name: "t() with {name}", iters: 1_500_000 },
  { name: "t() ICU plural (icuCompiler)", iters: 500_000 },
  { name: "prepareTranslation(<b>)", iters: 800_000 },
];

/**
 * The production ESM entries a measured dist must expose. Single source of
 * truth: `--probe` reports on exactly this list, so CI can ask whether a
 * reference build is comparable before trying to compare against it.
 */
export const REQUIRED_ENTRIES = ["comvi-core.js", "comvi-core-icu.js", "comvi-core-rich-text.js"];

/** Entries of REQUIRED_ENTRIES that `distRoot` does not have. */
export function missingEntries(distRoot) {
  return REQUIRED_ENTRIES.filter((file) => !fs.existsSync(path.join(path.resolve(distRoot), file)));
}

function distUrl(distRoot, file) {
  return url.pathToFileURL(path.join(path.resolve(distRoot), file)).href;
}

/**
 * Builds the five thunks against one dist root. The inputs are fixed and
 * identical on both sides of a comparison — that is the whole protocol.
 */
export async function buildCaseThunks(distRoot) {
  const { createI18n } = await import(distUrl(distRoot, "comvi-core.js"));
  const { icuCompiler } = await import(distUrl(distRoot, "comvi-core-icu.js"));
  const { prepareTranslation } = await import(distUrl(distRoot, "comvi-core-rich-text.js"));

  const catalog = {};
  for (let i = 0; i < 200; i++) {
    catalog[`key${i}`] = i % 3 ? `Hello, {name}! Item ${i}` : `Static text number ${i}`;
  }
  catalog.rich = "Click <b>here</b> for {what}";

  const make = () => createI18n({ locale: "en", translation: { en: catalog } });
  const staticI18n = make();
  const paramI18n = make();
  const richI18n = make();
  const icuI18n = createI18n({
    locale: "en",
    compiler: icuCompiler,
    translation: { en: { n: "{count, plural, one {# item} other {# items}}" } },
  });

  return [
    () => make(),
    () => staticI18n.t("key0"),
    () => paramI18n.t("key1", { name: "world" }),
    () => icuI18n.t("n", { count: 5 }),
    () => prepareTranslation(richI18n, { i18nKey: "rich", params: { what: "docs" } }),
  ];
}

/**
 * Sink for every measured call's result. Without it V8 is free to treat a
 * discarded `t()` return as dead and to vary how much of the call it elides
 * between processes, which showed up as an 11 % swing between two runs of the
 * SAME dist — a false regression, not a measurement.
 */
const NEVER = Symbol("perf.sink");

/** One timed run: warm up, then time `iters` calls. Returns µs/op. */
export function timeOne(fn, iters) {
  let sink;
  for (let w = 0; w < WARMUP_CALLS; w++) sink = fn();
  const started = performance.now();
  for (let k = 0; k < iters; k++) sink = fn();
  const elapsedMs = performance.now() - started;
  // Keeps `sink` observable, so the loop above cannot be optimised away.
  if (sink === NEVER) throw new Error("unreachable");
  return (elapsedMs * 1000) / iters;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Runs every case in-process against one dist: `runs` timed runs, median kept. */
export async function measureDist(distRoot, runs = SINGLE_MODE_RUNS) {
  const thunks = await buildCaseThunks(distRoot);
  return CASES.map((testCase, index) => {
    const samples = [];
    for (let run = 0; run < runs; run++) samples.push(timeOne(thunks[index], testCase.iters));
    return { name: testCase.name, median: median(samples), samples };
  });
}

/**
 * One case, one dist, in a FRESH child process — so a compare run never holds
 * two builds of core in one isolate. Returns µs/op.
 */
function measureInChild(distRoot, caseIndex) {
  const child = spawnSync(
    process.execPath,
    [url.fileURLToPath(import.meta.url), "--measure-one", distRoot, String(caseIndex)],
    { encoding: "utf8" },
  );
  if (child.status !== 0) {
    throw new Error(
      `perf worker failed for ${CASES[caseIndex].name} @ ${distRoot}:\n${child.stderr || child.stdout}`,
    );
  }
  const value = Number.parseFloat(child.stdout.trim().split("\n").pop());
  if (!Number.isFinite(value)) {
    throw new Error(`perf worker produced no number for ${CASES[caseIndex].name} @ ${distRoot}`);
  }
  return value;
}

/**
 * Interleaved A/B. For each repetition, every case is measured on A and then on
 * B, so slow drift (thermal, a noisy neighbour) lands on both sides rather than
 * on whichever ran second. The MIN over repetitions is kept per side.
 */
export function compareDists(distRootA, distRootB, repetitions = COMPARE_REPETITIONS) {
  const samples = CASES.map(() => ({ a: [], b: [] }));
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (let index = 0; index < CASES.length; index++) {
      samples[index].a.push(measureInChild(distRootA, index));
      samples[index].b.push(measureInChild(distRootB, index));
    }
  }
  return CASES.map((testCase, index) => {
    const a = Math.min(...samples[index].a);
    const b = Math.min(...samples[index].b);
    return { name: testCase.name, a, b, deltaPct: ((b - a) / a) * 100, samples: samples[index] };
  });
}

export function renderSingle(results) {
  const width = Math.max(...results.map((result) => result.name.length));
  const lines = [`| ${"case".padEnd(width)} | median µs/op | runs |`];
  lines.push(`| ${"-".repeat(width)} | ---: | --- |`);
  for (const result of results) {
    const runs = result.samples.map((sample) => sample.toFixed(3)).join(" ");
    lines.push(`| ${result.name.padEnd(width)} | ${result.median.toFixed(3)} | ${runs} |`);
  }
  return lines.join("\n");
}

export function renderCompare(results, thresholdPct) {
  const width = Math.max(...results.map((result) => result.name.length));
  const lines = [`| ${"case".padEnd(width)} | A µs/op | B µs/op | Δ% |`];
  lines.push(`| ${"-".repeat(width)} | ---: | ---: | ---: |`);
  for (const result of results) {
    const regressed = result.deltaPct > thresholdPct;
    const delta = `${result.deltaPct >= 0 ? "+" : ""}${result.deltaPct.toFixed(2)}%`;
    lines.push(
      `| ${result.name.padEnd(width)} | ${result.a.toFixed(3)} | ${result.b.toFixed(3)} | ` +
        `${delta}${regressed ? "  <-- REGRESSION" : ""} |`,
    );
  }
  return lines.join("\n");
}

export function regressions(results, thresholdPct) {
  return results.filter((result) => result.deltaPct > thresholdPct);
}

function readRepetitions(argv) {
  const flag = argv.indexOf("--repetitions");
  if (flag === -1) return COMPARE_REPETITIONS;
  const value = Number.parseInt(argv[flag + 1], 10);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("--repetitions needs a positive integer");
  return value;
}

function readThreshold(argv) {
  const flag = argv.indexOf("--threshold");
  if (flag === -1) return DEFAULT_THRESHOLD_PCT;
  const value = Number.parseFloat(argv[flag + 1]);
  if (!Number.isFinite(value)) throw new Error("--threshold needs a number (percent)");
  return value;
}

async function main(argv) {
  // Internal worker: one case, one dist, one number on stdout.
  const worker = argv.indexOf("--measure-one");
  if (worker !== -1) {
    const distRoot = argv[worker + 1];
    const caseIndex = Number.parseInt(argv[worker + 2], 10);
    const thunks = await buildCaseThunks(distRoot);
    process.stdout.write(`${timeOne(thunks[caseIndex], CASES[caseIndex].iters)}\n`);
    return 0;
  }

  // `--probe <distRoot>`: exit 0 when the dist exposes every entry the protocol
  // loads, 3 when it does not. CI uses it to tell "no regression" apart from
  // "the reference build predates these entry points and cannot be compared".
  const probe = argv.indexOf("--probe");
  if (probe !== -1) {
    const distRoot = argv[probe + 1];
    if (!distRoot) {
      console.error("usage: node scripts/perf.mjs --probe <distRoot>");
      return 2;
    }
    const missing = missingEntries(distRoot);
    if (missing.length > 0) {
      console.error(`${path.resolve(distRoot)} is missing: ${missing.join(", ")}`);
      return 3;
    }
    console.log(
      `${path.resolve(distRoot)} exposes all ${REQUIRED_ENTRIES.length} measured entries`,
    );
    return 0;
  }

  const compare = argv.indexOf("--compare");
  if (compare !== -1) {
    const [distRootA, distRootB] = [argv[compare + 1], argv[compare + 2]];
    if (!distRootA || !distRootB) {
      console.error(
        "usage: node scripts/perf.mjs --compare <distRootA> <distRootB> [--threshold <pct>] [--repetitions <n>]",
      );
      return 2;
    }
    const thresholdPct = readThreshold(argv);
    const repetitions = readRepetitions(argv);
    const results = compareDists(distRootA, distRootB, repetitions);
    console.log(`A (reference) = ${path.resolve(distRootA)}`);
    console.log(`B (candidate) = ${path.resolve(distRootB)}`);
    console.log(`interleaved, min of ${repetitions} per side, threshold ${thresholdPct}% on Δ\n`);
    console.log(renderCompare(results, thresholdPct));
    console.log(
      `\n${JSON.stringify(
        Object.fromEntries(
          results.map((result) => [result.name, Number(result.deltaPct.toFixed(3))]),
        ),
      )}`,
    );
    const failed = regressions(results, thresholdPct);
    if (failed.length > 0) {
      console.error(
        `\nPerf gate failed: ${failed
          .map((result) => `${result.name} +${result.deltaPct.toFixed(2)}%`)
          .join(", ")} (threshold ${thresholdPct}%)`,
      );
      return 1;
    }
    console.log(`\nPerf gate passed: no case regressed more than ${thresholdPct}%.`);
    return 0;
  }

  const distRoot = argv.find((arg) => !arg.startsWith("--")) ?? DEFAULT_DIST;
  const results = await measureDist(distRoot);
  console.log(`dist: ${path.resolve(distRoot)}`);
  console.log(`${WARMUP_CALLS} warm-up calls, ${SINGLE_MODE_RUNS} runs, median µs/op\n`);
  console.log(renderSingle(results));
  console.log(
    `\n${JSON.stringify(
      Object.fromEntries(results.map((result) => [result.name, Number(result.median.toFixed(4))])),
    )}`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
