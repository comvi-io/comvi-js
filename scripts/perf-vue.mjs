import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { buildReference } from "./perf.mjs";

/**
 * Render bench for `@comvi/vue` — INFORMATIONAL, never a gate (owner rule: no wall-clock
 * threshold blocks anything; the binding's reactivity is gated by COUNTED renders in
 * packages/vue/tests, e.g. 1,000 locale readers re-render 0 times while a namespace loads).
 * `scripts/perf.mjs` measures the core only and has no binding slot, so the binding cases
 * live here, on the same protocol: one measurement per child process, interleaved A/B,
 * medians.
 *
 * Cases (the same app on either API, so a Δ reads across the 0.7 → 0.8 rebuild): one
 * `renderToString` of a component with 200 `t()` calls with `{name}`, 200 ICU plurals,
 * and 200 `<T>` elements whose tag is rendered by a slot.
 *
 *   node scripts/perf-vue.mjs [vueDist]                    one dist (default packages/vue/dist)
 *   node scripts/perf-vue.mjs --compare-ref <gitRef> [--repetitions <n>]
 *     builds `<gitRef>`'s @comvi/vue and @comvi/core in the perf.mjs reference worktree and
 *     compares this checkout against it.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DIST = path.join(REPO_ROOT, "packages", "vue", "dist");
const N = 200;
const WARMUP = 50;
const RENDERS = 100;
const RUNS = 5;

export const CASES = [
  "SSR: 200 t() with {name}",
  "SSR: 200 ICU plurals",
  "SSR: 200 <T> with a slot",
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The app of case `index` on the @comvi/vue in `dist` (0.8, or the 0.7 API it detects). */
async function buildCase(dist, index) {
  const req = createRequire(path.join(dist, "..", "package.json"));
  const vue = await import(url.pathToFileURL(req.resolve("vue")).href);
  const { renderToString } = await import(
    url.pathToFileURL(req.resolve("vue/server-renderer")).href
  );
  const binding = await import(url.pathToFileURL(path.join(dist, "comvi-vue.js")).href);
  const is08 = "handover" in binding;
  const messages = {
    hi: "Hello, {name}!",
    items: "{count, plural, one {# item} other {# items}}",
    rich: "Read <b>this</b> now",
  };
  const options = is08
    ? { locale: "en", messages: { en: messages } }
    : { locale: "en", ssrLocale: "en", compiler: binding.icuCompiler, messages: { en: messages } };
  const { h, createSSRApp } = vue;
  const App = {
    setup() {
      const { t } = binding.useI18n();
      const slot = { b: ({ children }) => h("b", children) };
      return () =>
        h(
          "div",
          Array.from({ length: N }, (_, i) =>
            index === 0
              ? h("p", t("hi", { name: `n${i}` }))
              : index === 1
                ? h("p", t("items", { count: i }))
                : h("p", [h(binding.T, { i18nKey: "rich" }, slot)]),
          ),
        );
    },
  };
  return async () => {
    const i18n = binding.createI18n(options);
    return renderToString(createSSRApp(App).use(i18n));
  };
}

/** µs per render of case `index`, median of RUNS runs of RENDERS renders (one process). */
async function measureOne(dist, index) {
  const render = await buildCase(dist, index);
  const html = await render();
  if (!html.includes(index === 2 ? "<b>this</b>" : index === 1 ? "199 items" : "Hello, n199!"))
    throw new Error(`case ${CASES[index]} rendered the wrong text: ${html.slice(0, 200)}`);
  for (let i = 0; i < WARMUP; i++) await render();
  const runs = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < RENDERS; i++) await render();
    runs.push(((performance.now() - t0) * 1000) / RENDERS);
  }
  return median(runs);
}

function child(dist, index) {
  const r = spawnSync(
    process.execPath,
    [url.fileURLToPath(import.meta.url), "--measure-one", dist, String(index)],
    {
      encoding: "utf8",
    },
  );
  if (r.status !== 0)
    throw new Error(`perf-vue worker failed (${CASES[index]} @ ${dist}):\n${r.stderr}`);
  return Number(r.stdout.trim());
}

function readRepetitions(argv) {
  const i = argv.indexOf("--repetitions");
  return i === -1 ? 3 : Number.parseInt(argv[i + 1], 10);
}

async function main(argv) {
  const one = argv.indexOf("--measure-one");
  if (one !== -1) {
    process.stdout.write(`${await measureOne(argv[one + 1], Number(argv[one + 2]))}\n`);
    return 0;
  }
  const header = () =>
    console.log(
      `node ${process.version}, load1 ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cpus; ` +
        `${RENDERS} renders × ${RUNS} runs per measurement, median µs/render (informational)`,
    );
  const refArg = argv.indexOf("--compare-ref");
  if (refArg !== -1) {
    const ref = argv[refArg + 1];
    const coreDist = buildReference(ref, { packages: ["@comvi/core", "@comvi/vue"] });
    const refDist = path.join(coreDist, "..", "..", "vue", "dist");
    if (!fs.existsSync(path.join(refDist, "comvi-vue.js")))
      throw new Error(`${ref} has no built @comvi/vue at ${refDist}`);
    const reps = readRepetitions(argv);
    const a = CASES.map(() => []);
    const b = CASES.map(() => []);
    for (let r = 0; r < reps; r++)
      for (let i = 0; i < CASES.length; i++) {
        a[i].push(child(refDist, i));
        b[i].push(child(DEFAULT_DIST, i));
      }
    header();
    console.log(`A (reference ${ref}) = ${refDist}\nB (candidate) = ${DEFAULT_DIST}`);
    console.log(`interleaved, median of ${reps} per side\n`);
    console.log("| case | A median µs | B median µs | Δ% | A runs | B runs |");
    console.log("| --- | ---: | ---: | ---: | --- | --- |");
    const out = {};
    CASES.forEach((name, i) => {
      const [ma, mb] = [median(a[i]), median(b[i])];
      const d = ((mb - ma) / ma) * 100;
      out[name] = Number(d.toFixed(2));
      console.log(
        `| ${name} | ${ma.toFixed(1)} | ${mb.toFixed(1)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}% | ` +
          `${a[i].map((x) => x.toFixed(0)).join(" ")} | ${b[i].map((x) => x.toFixed(0)).join(" ")} |`,
      );
    });
    console.log(`\n${JSON.stringify(out)}`);
    return 0;
  }
  const dist = argv.find((a) => !a.startsWith("--")) ?? DEFAULT_DIST;
  header();
  for (let i = 0; i < CASES.length; i++)
    console.log(`| ${CASES[i]} | ${child(dist, i).toFixed(1)} µs |`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
