import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

/**
 * Runtime perf bench for `@comvi/core` — INFORMATIONAL, never a gate (owner rule: no
 * wall-clock threshold blocks anything; perf is guarded by counted work in the unit
 * suites, e.g. the layered add() and compile-cache counters). Every mode exits 0 once
 * it has measured; `--threshold` only flags cases in the report.
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
 *     Interleaved A/B: for each repetition it measures A then B for every case
 *     (default three repetitions) and reports the MEDIAN per side, Δ% on the
 *     median (the min is printed alongside). A case whose median Δ is above the
 *     threshold (default 5 %) is FLAGGED in the report; the exit code stays 0.
 *     A is the reference (main), B the candidate (PR head).
 *
 *   node scripts/perf.mjs --extended [distRoot]
 *     The 0.8-only scenarios of synthesis §4.5 that have no 0.7 counterpart:
 *     construction over a shared vs a fresh 10K catalog, ICU plural over 500 vs
 *     5,000 distinct keys against the same run's static-key floor, a Zipf key
 *     mix over 10K keys, a locale switch followed by 200 t() calls, and the heap
 *     bytes per compiled key (a child with --expose-gc). Medians of 5 runs.
 *
 *   node scripts/perf.mjs --ssr [distRoot]
 *     S8 (design §2.3 item 6, R4-13/R4-14): SSR with loading, an instance per request
 *     over ONE `createCatalogStore()` and a `cdn()` loader whose `fetch` is a local mock
 *     (no network). Warm (every catalog fresh in the store) and revalidating (`ttl: 0`:
 *     every request answers from the store while ONE conditional GET per catalog is in
 *     flight at a time behind it, the mock answering 304 — sequentially that is one per
 *     request, at 16 concurrent requests they coalesce), each sequential and at 16
 *     concurrent requests. The rendered outputs are checked before timing. Prints req/s (medians of 5 runs) and the COUNTED facts beside them —
 *     fetches, distinct catalog objects the instances got, compiled entries — which
 *     are what the unit suite gates (tests/cdn/store.test.ts); the req/s are
 *     informational.
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
  // R3-17's gate: a plain `{x}` holding a NUMBER prints String(value) in 0.8 as in 0.7 —
  // the non-string path of the interpolation, which `{name}` (a string) never takes.
  { name: "t() with {name} = a number", iters: 1_500_000 },
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
 * Deltas against 0.7 that the owner accepted: when one of these cases is flagged, the
 * report marks it accepted (with who decided, when and why) so it is not re-reported as a
 * new regression. Against a 0.8 reference the same delta would be new: read the mark
 * as "known vs 0.7", never as a waiver for a regression between two 0.8 builds.
 */
const FORMATTERS_0_7 =
  "owner 28.10.2026: @comvi/core/format is ~25-40 ns per call slower than 0.7 " +
  "(locale chain + shared Intl cache key per call); accepted, no extra caching";
export const ACCEPTED_VS_07 = {
  formatNumber: FORMATTERS_0_7,
  "formatNumber, fallbackLocale": FORMATTERS_0_7,
  formatDate: FORMATTERS_0_7,
  "formatDate, fallbackLocale": FORMATTERS_0_7,
  formatRelativeTime: FORMATTERS_0_7,
  "formatRelativeTime, fallbackLocale": FORMATTERS_0_7,
};

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
      () => paramI18n.t("key1", { name: 1004 }),
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
    () => paramI18n.t("key1", { name: 1004 }),
    () => icuI18n.t("n", { count: 5 }),
    () => ampI18n.t("n", { count: 5 }),
    () => richI18n.t("rich", { b, what: "docs" }),
    () => formatNumber(bareI18n, 1234.5),
    () => formatNumber(fallbackI18n, 1234.5),
    () => formatDate(bareI18n, date),
    () => formatDate(fallbackI18n, date),
    // 0.8 takes (date, now) and picks the unit: the same "3 days ago" as 0.7's (-3, "day").
    () => formatRelativeTime(bareI18n, date - 3 * 86_400_000, date),
    () => formatRelativeTime(fallbackI18n, date - 3 * 86_400_000, date),
    () => bigI18n.add("en", { k1: `Changed ${n++} {name}` }),
  ];
}

/** A deterministic PRNG (mulberry32), so every run draws the same key mix. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * The 0.8-only scenarios of synthesis §4.5 (no 0.7 counterpart, so no A/B): each is
 * `{ name, iters, unit, fn }` where `fn(i)` is one operation; the floor case is first.
 */
export async function buildExtendedCases(distRoot) {
  const { createI18n } = await import(distUrl(distRoot, "comvi-core.js"));
  const keys10k = (fmt) => {
    const c = {};
    for (let i = 0; i < 10_000; i++) c[`k${i}`] = fmt(i);
    return c;
  };
  const shared = keys10k((i) => (i % 2 ? `Hi {name} #${i}` : `Static ${i}`));
  // Never reused across warm-up and runs: 5 × (warm-up + iters) distinct identities. The
  // constructor never walks a catalog's keys (compiling is lazy), so a distinct object
  // over the 10K catalog as its prototype measures the same first-sight cost as a copy.
  const FRESH = 2_000;
  const fresh = Array.from({ length: 6 * (WARMUP_CALLS + FRESH) }, () => Object.create(shared));
  const plural = (n) => {
    const c = {};
    for (let i = 0; i < n; i++)
      c[`p${i}`] = `{count, plural, one {# item ${i}} other {# items ${i}}}`;
    return c;
  };
  const statics = createI18n({ locale: "en", messages: { en: { s: "Static" } } });
  const icu500 = createI18n({ locale: "en", messages: { en: plural(500) } });
  const icu5000 = createI18n({ locale: "en", messages: { en: plural(5_000) } });
  const p500 = Array.from({ length: 500 }, (_, i) => `p${i}`);
  const p5000 = Array.from({ length: 5_000 }, (_, i) => `p${i}`);
  const counts = Array.from({ length: 7 }, (_, n) => ({ count: n }));
  // Zipf (s = 1) over 10K keys: a few keys carry most calls, as in a real UI.
  const zipfI18n = createI18n({ locale: "en", messages: { en: shared } });
  const H = Array.from({ length: 10_000 }, (_, i) => 1 / (i + 1));
  const total = H.reduce((a, b) => a + b, 0);
  const cdf = [];
  H.reduce((acc, h, i) => ((cdf[i] = (acc + h) / total), acc + h), 0);
  const draw = rng(42);
  const zipf = Array.from({ length: 65_536 }, () => {
    const u = draw();
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return `k${lo}`;
  });
  const P = { name: "x" };
  const switcher = createI18n({
    locale: "en",
    messages: { en: keys10k((i) => `Hi {name} ${i}`), de: keys10k((i) => `Hallo {name} ${i}`) },
  });
  const loc = ["de", "en"];
  return [
    { name: "floor: t() static key", iters: 2_000_000, fn: () => statics.t("s") },
    {
      name: "constructor, shared 10K catalog object",
      iters: 20_000,
      fn: () => createI18n({ locale: "en", messages: { en: shared } }),
    },
    {
      name: "constructor, fresh 10K catalog object",
      iters: FRESH,
      fn: (i) => createI18n({ locale: "en", messages: { en: fresh[i] } }),
    },
    {
      name: "t() ICU plural, 500 keys",
      iters: 500_000,
      fn: (i) => icu500.t(p500[i % 500], counts[i % 7]),
    },
    {
      name: "t() ICU plural, 5,000 keys",
      iters: 500_000,
      fn: (i) => icu5000.t(p5000[i % 5_000], counts[i % 7]),
    },
    {
      name: "t() Zipf mix over 10K keys",
      iters: 1_000_000,
      fn: (i) => zipfI18n.t(zipf[i & 65_535], P),
    },
    {
      name: "setLocale (sync) + 200 t()",
      iters: 5_000,
      fn: (i) => {
        void switcher.setLocale(loc[i & 1]);
        let r;
        for (let k = 0; k < 200; k++) r = switcher.t(`k${(i * 200 + k) % 10_000}`, P);
        return r;
      },
    },
  ];
}

/** Heap bytes per compiled key: 10K keys, every key rendered once (run with --expose-gc). */
async function heapPerKey(distRoot) {
  const { createI18n } = await import(distUrl(distRoot, "comvi-core.js"));
  const c = {};
  for (let i = 0; i < 10_000; i++) c[`k${i}`] = i % 2 ? `Hi {name} #${i}` : `Static ${i}`;
  const P = { name: "x" };
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const i18n = createI18n({ locale: "en", messages: { en: c } });
  for (let i = 0; i < 10_000; i++) i18n.t(`k${i}`, P);
  globalThis.gc();
  const after = process.memoryUsage().heapUsed;
  if (i18n.t("k1", P) === NEVER) throw new Error("unreachable");
  return (after - before) / 10_000;
}

async function runExtended(distRoot) {
  const cases = await buildExtendedCases(distRoot);
  console.log(`dist: ${path.resolve(distRoot)}`);
  console.log(
    `node ${process.version}, load1 ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cpus; median of ${SINGLE_MODE_RUNS} runs (informational)\n`,
  );
  const rows = cases.map((c) => {
    const samples = [];
    let i = 0;
    for (let r = 0; r < SINGLE_MODE_RUNS; r++) samples.push(timeOne(() => c.fn(i++), c.iters));
    return { name: c.name, median: median(samples), samples };
  });
  console.log(renderSingle(rows));
  const floor = rows[0].median;
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.median]));
  const i500 = byName["t() ICU plural, 500 keys"];
  const i5000 = byName["t() ICU plural, 5,000 keys"];
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", url.fileURLToPath(import.meta.url), "--heap-per-key", distRoot],
    { encoding: "utf8" },
  );
  const heap = Number.parseFloat(child.stdout.trim().split("\n").pop());
  const summary = {
    "ICU 500 / floor": Number((i500 / floor).toFixed(2)),
    "ICU 5000 / floor": Number((i5000 / floor).toFixed(2)),
    "ICU 5000 vs 500 (%)": Number((((i5000 - i500) / i500) * 100).toFixed(1)),
    "heap B per compiled key": Number(heap.toFixed(0)),
  };
  console.log(`\n${JSON.stringify(summary)}`);
  console.log(
    `\n${JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, Number(r.median.toFixed(4))])))}`,
  );
  return 0;
}

/**
 * S8 — SSR with loading (see `--ssr`). A request: a new instance over the shared store,
 * `await ready`, then `RENDERED` `t()` calls over the default namespace (a third with a
 * `{name}`, a third ICU plural). The store and the catalogs live as long as the process.
 */
const SSR_KEYS = 2_000;
const SSR_RENDERED = 60;
const SSR_REQUESTS = 2_000;
const SSR_CONCURRENCY = 16;

export async function buildSsrScenarios(distRoot) {
  const { createI18n } = await import(distUrl(distRoot, "comvi-core.js"));
  const { cdn, createCatalogStore } = await import(distUrl(distRoot, "comvi-core-cdn.js"));
  const catalog = (tag) => {
    const c = {};
    for (let i = 0; i < SSR_KEYS; i++)
      c[`k${i}`] =
        i % 3 === 0
          ? `${tag} static ${i}`
          : i % 3 === 1
            ? `${tag} hi {name} ${i}`
            : `{count, plural, one {# ${tag} item} other {# ${tag} items}}`;
    return JSON.stringify(c);
  };
  const bodies = { en: catalog("en"), de: catalog("de") };
  const scenario = (name, ttl) => {
    const counts = { fetches: 0, conditional: 0 };
    /** The CDN, mocked in-process: a 200 with an ETag, or a 304 for a matching one. */
    const fetch = async (u, init) => {
      counts.fetches++;
      const locale = /\/([^/]+)\.json$/.exec(u)[1];
      const etag = `"${locale}-v1"`;
      if (init?.headers?.["If-None-Match"] === etag) {
        counts.conditional++;
        return new Response(null, { status: 304, headers: { etag } });
      }
      return new Response(bodies[locale], { headers: { etag } });
    };
    const store = createCatalogStore({ ttl });
    const loader = cdn("https://cdn.example/dist", { fetch, store });
    const seen = new Set();
    /** The parameters of key `k<j>`: by `j % 3`, the template's kind (see `catalog`). */
    const params = [
      undefined,
      { name: "Ann" },
      { count: 1 },
      undefined,
      { name: "Bo" },
      { count: 5 },
    ];
    const paramsOf = (j) => params[j % 6];
    const request = async (i) => {
      const i18n = createI18n({ locale: i & 1 ? "de" : "en", loader });
      await i18n.ready;
      let out;
      for (let k = 0, j; k < SSR_RENDERED; k++)
        out = i18n.t(`k${(j = (i * 7 + k) % SSR_KEYS)}`, paramsOf(j));
      seen.add(CORE_SLOT(i18n));
      i18n.destroy();
      return out;
    };
    /** Renders one key of each kind and throws unless each output is the expected one. */
    const check = async () => {
      const i18n = createI18n({ locale: "en", loader });
      await i18n.ready;
      const got = [0, 1, 2, 5].map((j) => i18n.t(`k${j}`, paramsOf(j)));
      i18n.destroy();
      const want = ["en static 0", "en hi Ann 1", "1 en item", "5 en items"];
      if (JSON.stringify(got) !== JSON.stringify(want))
        throw new Error(
          `S8 ${name}: rendered ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
        );
    };
    return { name, request, check, counts, seen };
  };
  return [
    scenario("SSR warm (store fresh)", 3_600_000),
    scenario("SSR revalidating (ttl 0, 304)", 0),
  ];
}

/** The catalog object an instance holds for its locale (through `@comvi/core/internal`). */
let CORE_SLOT = () => undefined;

async function timeRequests(request, total, concurrency) {
  let next = 0;
  let sink;
  const worker = async () => {
    while (next < total) sink = await request(next++);
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const ms = performance.now() - started;
  if (sink === NEVER) throw new Error("unreachable");
  return (total / ms) * 1000;
}

async function runSsr(distRoot) {
  const { state } = await import(distUrl(distRoot, "comvi-core-internal.js"));
  CORE_SLOT = (i18n) => state(i18n).c.default?.[i18n.locale]?.m;
  const scenarios = await buildSsrScenarios(distRoot);
  console.log(`dist: ${path.resolve(distRoot)}`);
  console.log(
    `node ${process.version}, load1 ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cpus; ` +
      `${SSR_REQUESTS} requests per run, ${SSR_RENDERED} t() each over a ${SSR_KEYS}-key catalog ` +
      `(2 locales); median req/s of ${SINGLE_MODE_RUNS} runs (informational, never a gate)\n`,
  );
  const rows = [];
  for (const sc of scenarios) {
    // The outputs are right before anything is timed.
    await sc.check();
    // Warm-up: the store fills, every key used compiles once.
    await timeRequests(sc.request, SSR_REQUESTS, 1);
    const before = { ...sc.counts };
    for (const c of [1, SSR_CONCURRENCY]) {
      const samples = [];
      for (let r = 0; r < SINGLE_MODE_RUNS; r++)
        samples.push(await timeRequests(sc.request, SSR_REQUESTS, c));
      // Sequentially with `ttl: 0` no two requests overlap, so nothing coalesces: every
      // request starts its own conditional GET (the 304 path per request), not
      // stale-while-revalidate behind concurrent ones.
      rows.push({
        name: `${sc.name}, ${c == 1 ? "sequential" : `${c} concurrent`}`,
        reqPerSec: median(samples),
      });
    }
    const requests = 2 * SINGLE_MODE_RUNS * SSR_REQUESTS;
    rows.push({
      name: `${sc.name}: counted`,
      fetches: sc.counts.fetches - before.fetches,
      conditional304: sc.counts.conditional - before.conditional,
      requests,
      catalogObjects: sc.seen.size,
    });
  }
  for (const row of rows)
    console.log(
      row.reqPerSec !== undefined
        ? `${row.name.padEnd(48)} ${Math.round(row.reqPerSec).toLocaleString("en-US").padStart(9)} req/s`
        : `${row.name.padEnd(48)} ${row.fetches} fetches (${row.conditional304} answered 304) for ${row.requests} requests; ${row.catalogObjects} catalog objects in all instances` +
            (row.fetches ? " (one revalidation in flight per catalog at a time)" : ""),
    );
  console.log(`\n${JSON.stringify(rows)}`);
  return 0;
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

  if (refresh) {
    // Unregister the worktree, not only its directory: a directory deleted alone leaves a
    // "missing but already registered" entry that makes the next `worktree add` fail.
    try {
      git(["worktree", "remove", "--force", dir]);
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REF_ROOT, { recursive: true });
    console.log(
      `preparing reference ${ref} (${sha.slice(0, 12)}) in ${path.relative(REPO_ROOT, dir)}`,
    );
    // `--force`: a directory removed by hand earlier may still be registered here.
    git(["worktree", "add", "--force", "--detach", dir, sha]);
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
 * on whichever ran second. The MEDIAN over repetitions is the reported figure;
 * the min is kept alongside for reading noise.
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
      deltaMinPct: ((b - a) / a) * 100,
      aMedian: am,
      bMedian: bm,
      deltaPct: ((bm - am) / am) * 100,
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
    `| ${"case".padEnd(width)} | A median µs/op | B median µs/op | Δ% (median) | A min | B min | Δ% (min) |`,
  ];
  lines.push(`| ${"-".repeat(width)} | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  for (const result of results) {
    const flagged = result.deltaPct > thresholdPct;
    const mark = !flagged
      ? ""
      : ACCEPTED_VS_07[result.name]
        ? "  <-- accepted vs 0.7"
        : "  <-- flagged";
    lines.push(
      `| ${result.name.padEnd(width)} | ${result.aMedian.toFixed(3)} | ${result.bMedian.toFixed(3)} | ` +
        `${pct(result.deltaPct)}${mark} | ` +
        `${result.a.toFixed(3)} | ${result.b.toFixed(3)} | ${pct(result.deltaMinPct)} |`,
    );
  }
  return lines.join("\n");
}

/** Flagged cases that are not an accepted delta vs 0.7 ({@link ACCEPTED_VS_07}). */
export function regressions(results, thresholdPct) {
  return results.filter((result) => result.deltaPct > thresholdPct && !ACCEPTED_VS_07[result.name]);
}

/** Flagged cases that are an accepted delta vs 0.7. */
export function accepted(results, thresholdPct) {
  return results.filter((result) => result.deltaPct > thresholdPct && ACCEPTED_VS_07[result.name]);
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

/** Shared tail of `--compare` and `--compare-ref`: measure, render, flag (never fail). */
function runCompare(distRootA, distRootB, argv) {
  const thresholdPct = readThreshold(argv);
  const repetitions = readRepetitions(argv);
  const results = compareDists(distRootA, distRootB, repetitions);
  console.log(
    `node ${process.version}, load1 ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cpus`,
  );
  console.log(`A (reference) = ${path.resolve(distRootA)}`);
  console.log(`B (candidate) = ${path.resolve(distRootB)}`);
  console.log(
    `interleaved, median of ${repetitions} per side, flag above ${thresholdPct}% on the median Δ (informational)\n`,
  );
  console.log(renderCompare(results, thresholdPct));
  console.log(
    `\n${JSON.stringify(
      Object.fromEntries(
        results.map((result) => [result.name, Number(result.deltaPct.toFixed(3))]),
      ),
    )}`,
  );
  const flagged = regressions(results, thresholdPct);
  console.log(
    flagged.length > 0
      ? `\nFlagged (informational, not a gate): ${flagged
          .map((result) => `${result.name} +${result.deltaPct.toFixed(2)}%`)
          .join(
            ", ",
          )} (median Δ above ${thresholdPct}%). Re-run on a quiet machine before reading them.`
      : `\nNo case's median moved more than ${thresholdPct}%.`,
  );
  const known = accepted(results, thresholdPct);
  if (known.length > 0)
    console.log(
      `Accepted vs 0.7 (not new; new if A is a 0.8 build): ${known
        .map((result) => `${result.name} +${result.deltaPct.toFixed(2)}%`)
        .join(
          ", ",
        )} — ${[...new Set(known.map((result) => ACCEPTED_VS_07[result.name]))].join("; ")}.`,
    );
  return 0;
}

async function main(argv) {
  const heap = argv.indexOf("--heap-per-key");
  if (heap !== -1) {
    process.stdout.write(`${await heapPerKey(argv[heap + 1])}\n`);
    return 0;
  }
  const ssr = argv.indexOf("--ssr");
  if (ssr !== -1) {
    const distRoot = argv.find((arg) => !arg.startsWith("--")) ?? DEFAULT_DIST;
    return runSsr(distRoot);
  }
  const extended = argv.indexOf("--extended");
  if (extended !== -1) {
    const distRoot = argv.find((arg) => !arg.startsWith("--")) ?? DEFAULT_DIST;
    return runExtended(distRoot);
  }

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
