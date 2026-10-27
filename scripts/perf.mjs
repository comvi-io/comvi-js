import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

/**
 * Runtime perf gate for `@comvi/core`.
 *
 * Fixed cases over a fixed 200-key catalog: construction, `t()` on a static
 * key, `t()` with a `{name}` param, `t()` on an ICU plural, a `<b>` rich-text
 * message, the three Intl formatters with and without a fallback chain, and
 * `add()` of one key over a compiled 10K catalog. Every case gets a 2000-call
 * warm-up, then N timed runs; the reported figure is the MEDIAN µs/op.
 *
 * The protocol is API-neutral: `buildCaseThunks` reads either core generation —
 * 0.7 (`comvi-core-icu.js`: `icuCompiler`, `prepareTranslation`, `addMessages`)
 * or 0.8 (`createI18n` with ICU always on, `@comvi/core/format`, `add()`) — and
 * builds the same inputs for both, so `--compare-ref` reads a Δ across the rebuild.
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
 *   node scripts/perf.mjs --compare-ref <gitRef> [--threshold <pct>] [--repetitions <n>] [--refresh]
 *     The release form: builds `<gitRef>` into a reusable worktree under
 *     `.perf-ref/` and compares this checkout's core against it. Exits 3 when
 *     the reference predates an entry the protocol loads (compare an older ref
 *     instead — a build that cannot expose the entries is not a regression).
 *
 *   node scripts/perf.mjs --compare <distRootA> <distRootB> [--threshold <pct>] [--repetitions <n>]
 *     Interleaved A/B: for each repetition it measures A then B for every case,
 *     three times, and keeps the MIN per side (the least-disturbed run — a
 *     benchmark's noise is one-sided). Prints Δ% per case (on the min, and on the
 *     median for reports) and exits 1 when any
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
  // A plural branch of ordinary copy that contains a bare `&`. The branch is
  // text, so it must take the same text-only path as the case above; the `&`
  // is here because it is a character the parser offers to the syntax
  // extensions, and a branch routed to the parser over one costs ~25% more for
  // byte-identical output. "Terms & Conditions" is the copy this happens to.
  { name: "t() ICU plural, branch with a bare &", iters: 500_000 },
  { name: "rich text <b>", iters: 800_000 },
  // Formatters resolve the locale chain on every call, so each runs once on a
  // bare instance and once with a `fallbackLocale` configured.
  { name: "formatNumber", iters: 500_000 },
  { name: "formatNumber, fallbackLocale", iters: 500_000 },
  { name: "formatDate", iters: 300_000 },
  { name: "formatDate, fallbackLocale", iters: 300_000 },
  { name: "formatRelativeTime", iters: 500_000 },
  { name: "formatRelativeTime, fallbackLocale", iters: 500_000 },
  // A layered patch in 0.8 (R4-1b), a copy-on-write merge in 0.7.
  { name: "add() one key over a compiled 10K catalog", iters: 2_000 },
];

/**
 * The production ESM entries a measured dist must expose. Single source of
 * truth: `--probe` reports on exactly this list, so CI can ask whether a
 * reference build is comparable before trying to compare against it.
 */
export const REQUIRED_ENTRIES = ["comvi-core.js"];
/** The 0.7 generation's entries; a dist with all of them is read through the 0.7 adapter. */
const ENTRIES_07 = ["comvi-core-icu.js", "comvi-core-rich-text.js"];
/** The 0.8 generation's entries. */
const ENTRIES_08 = ["comvi-core-format.js"];

const has = (distRoot, file) => fs.existsSync(path.join(path.resolve(distRoot), file));

/** Which core generation `distRoot` is: "0.7", "0.8", or undefined. */
export function generation(distRoot) {
  if (!REQUIRED_ENTRIES.every((f) => has(distRoot, f))) return undefined;
  if (ENTRIES_07.every((f) => has(distRoot, f))) return "0.7";
  if (ENTRIES_08.every((f) => has(distRoot, f))) return "0.8";
  return undefined;
}

/** What `distRoot` lacks to be measured (empty when it is either generation). */
export function missingEntries(distRoot) {
  if (generation(distRoot)) return [];
  return [...REQUIRED_ENTRIES, ...ENTRIES_08].filter((file) => !has(distRoot, file));
}

function distUrl(distRoot, file) {
  return url.pathToFileURL(path.join(path.resolve(distRoot), file)).href;
}

/**
 * Builds one thunk per case against one dist root, in `CASES` order. The
 * inputs are fixed and identical on both sides of a comparison — that is the
 * whole protocol.
 */
export async function buildCaseThunks(distRoot) {
  const gen = generation(distRoot);
  const core = await import(distUrl(distRoot, "comvi-core.js"));
  const catalog = {};
  for (let i = 0; i < 200; i++) {
    catalog[`key${i}`] = i % 3 ? `Hello, {name}! Item ${i}` : `Static text number ${i}`;
  }
  catalog.rich = "Click <b>here</b> for {what}";
  const plural = "{count, plural, one {# item} other {# items}}";
  const amp = "{count, plural, one {# Term & Condition} other {# Terms & Conditions}}";
  const big = {};
  for (let i = 0; i < 10_000; i++) big[`k${i}`] = i % 2 ? `Hi {name} #${i}` : `Static ${i}`;
  const date = 1_700_000_000_000;
  let n = 0;

  if (gen === "0.7") {
    const { createI18n, formatNumber, formatDate, formatRelativeTime } = core;
    const { icuCompiler } = await import(distUrl(distRoot, "comvi-core-icu.js"));
    const { prepareTranslation } = await import(distUrl(distRoot, "comvi-core-rich-text.js"));
    const make = () => createI18n({ locale: "en", messages: { en: catalog } });
    const icu = (m) =>
      createI18n({ locale: "en", compiler: icuCompiler, messages: { en: { n: m } } });
    const [staticI18n, paramI18n, richI18n, icuI18n, ampI18n] = [
      make(),
      make(),
      make(),
      icu(plural),
      icu(amp),
    ];
    const bareI18n = createI18n({ locale: "de" });
    const fallbackI18n = createI18n({ locale: "de", fallbackLocale: "en" });
    const bigI18n = createI18n({ locale: "en", messages: { en: big } });
    for (let i = 0; i < 10_000; i++) bigI18n.t(`k${i}`, { name: "x" });
    return [
      () => make(),
      () => staticI18n.t("key0"),
      () => paramI18n.t("key1", { name: "world" }),
      () => icuI18n.t("n", { count: 5 }),
      () => ampI18n.t("n", { count: 5 }),
      () => prepareTranslation(richI18n, { i18nKey: "rich", params: { what: "docs" } }),
      () => formatNumber(bareI18n, 1234.5),
      () => formatNumber(fallbackI18n, 1234.5),
      () => formatDate(bareI18n, date),
      () => formatDate(fallbackI18n, date),
      () => formatRelativeTime(bareI18n, -3, "day"),
      () => formatRelativeTime(fallbackI18n, -3, "day"),
      () => bigI18n.addMessages({ en: { k1: `Changed ${n++} {name}` } }),
    ];
  }

  const { createI18n } = core;
  const { formatNumber, formatDate, formatRelativeTime } = await import(
    distUrl(distRoot, "comvi-core-format.js")
  );
  const make = () => createI18n({ locale: "en", messages: { en: catalog } });
  const icu = (m) => createI18n({ locale: "en", messages: { en: { n: m } } });
  const [staticI18n, paramI18n, richI18n, icuI18n, ampI18n] = [
    make(),
    make(),
    make(),
    icu(plural),
    icu(amp),
  ];
  const bareI18n = createI18n({ locale: "de" });
  const fallbackI18n = createI18n({ locale: "de", fallbackLocale: "en" });
  const bigI18n = createI18n({ locale: "en", messages: { en: big } });
  for (let i = 0; i < 10_000; i++) bigI18n.t(`k${i}`, { name: "x" });
  const b = (chunks) => chunks;
  return [
    () => make(),
    () => staticI18n.t("key0"),
    () => paramI18n.t("key1", { name: "world" }),
    () => icuI18n.t("n", { count: 5 }),
    () => ampI18n.t("n", { count: 5 }),
    () => richI18n.t("rich", { b, what: "docs" }),
    () => formatNumber(bareI18n, 1234.5),
    () => formatNumber(fallbackI18n, 1234.5),
    () => formatDate(bareI18n, date),
    () => formatDate(fallbackI18n, date),
    () => formatRelativeTime(bareI18n, -3, "day"),
    () => formatRelativeTime(fallbackI18n, -3, "day"),
    () => bigI18n.add("en", { k1: `Changed ${n++} {name}` }),
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

/** Worktrees built by `--compare-ref` live here; `.gitignore`d and reusable. */
const REF_ROOT = path.join(REPO_ROOT, ".perf-ref");

function git(args, cwd = REPO_ROOT) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd} (exit ${result.status})`);
  }
}

/**
 * Builds `ref` into a reusable worktree and returns its core dist root.
 *
 * The install passes `--store-dir` explicitly: the pnpm store lives INSIDE the
 * repo (`.pnpm-store`), so a worktree resolves its own empty one and
 * redownloads the whole dependency set instead of reusing what is already
 * there. It is also filtered to core's own graph — the protocol measures
 * nothing else, and the whole workspace's `node_modules` is 1.3 GB against
 * 359 MB for this, per reference kept on disk.
 */
export function buildReference(ref, { refresh = false } = {}) {
  const sha = git(["rev-parse", `${ref}^{commit}`]);
  const dir = path.join(REF_ROOT, sha.slice(0, 12));
  const dist = path.join(dir, "packages", "core", "dist");

  if (refresh) fs.rmSync(dir, { recursive: true, force: true });
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REF_ROOT, { recursive: true });
    console.log(
      `preparing reference ${ref} (${sha.slice(0, 12)}) in ${path.relative(REPO_ROOT, dir)}`,
    );
    git(["worktree", "add", "--detach", dir, sha]);
  }
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    run(
      "pnpm",
      [
        "install",
        "--frozen-lockfile",
        "--prefer-offline",
        "--filter",
        "@comvi/core...",
        "--store-dir",
        path.join(REPO_ROOT, ".pnpm-store"),
      ],
      dir,
    );
  }
  if (!fs.existsSync(dist) || refresh) {
    run("pnpm", ["--filter", "@comvi/core", "build"], dir);
  }
  return dist;
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
    const am = median(samples[index].a);
    const bm = median(samples[index].b);
    return {
      name: testCase.name,
      a,
      b,
      deltaPct: ((b - a) / a) * 100,
      aMedian: am,
      bMedian: bm,
      deltaMedianPct: ((bm - am) / am) * 100,
      samples: samples[index],
    };
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
  const lines = [
    `| ${"case".padEnd(width)} | A µs/op (min) | B µs/op (min) | Δ% (min) | A median | B median | Δ% (median) |`,
  ];
  lines.push(`| ${"-".repeat(width)} | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  for (const result of results) {
    const regressed = result.deltaPct > thresholdPct;
    lines.push(
      `| ${result.name.padEnd(width)} | ${result.a.toFixed(3)} | ${result.b.toFixed(3)} | ` +
        `${pct(result.deltaPct)}${regressed ? "  <-- REGRESSION" : ""} | ` +
        `${result.aMedian.toFixed(3)} | ${result.bMedian.toFixed(3)} | ${pct(result.deltaMedianPct)} |`,
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

/** Shared tail of `--compare` and `--compare-ref`: measure, render, gate. */
function runCompare(distRootA, distRootB, argv) {
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

  // `--compare-ref <gitRef>`: the release form. It prepares the reference build
  // itself, so the gate is one command rather than a worktree recipe nobody runs.
  const compareRef = argv.indexOf("--compare-ref");
  if (compareRef !== -1) {
    const ref = argv[compareRef + 1];
    if (!ref || ref.startsWith("--")) {
      console.error(
        "usage: node scripts/perf.mjs --compare-ref <gitRef> [--threshold <pct>] [--repetitions <n>] [--refresh]",
      );
      return 2;
    }
    const referenceDist = buildReference(ref, { refresh: argv.includes("--refresh") });
    const missingReference = missingEntries(referenceDist);
    if (missingReference.length > 0) {
      console.error(
        `${ref} cannot be compared: its core build is missing ${missingReference.join(", ")}.\n` +
          "Those entry points did not exist yet at that ref, so there is nothing to read a Δ " +
          "against — compare the branch point of the cycle that introduced them instead.",
      );
      return 3;
    }
    const missingHead = missingEntries(DEFAULT_DIST);
    if (missingHead.length > 0) {
      console.error(
        `this checkout is missing ${missingHead.join(", ")} — run \`pnpm build\` first`,
      );
      return 2;
    }
    return runCompare(referenceDist, DEFAULT_DIST, argv);
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
    return runCompare(distRootA, distRootB, argv);
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
