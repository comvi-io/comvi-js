// Non-gating bench of the 0.8 compile path (lot 1a): `@comvi/core/internal` from the
// built dist. Medians of 5 timed runs after a warm-up; ops/s. Absolute numbers are
// machine-local and load-sensitive — read them as ratios, and never as a gate (the
// gates are counted work: tests/compile/cache.test.ts). The createI18n/t() protocol of
// scripts/perf.mjs returns in lot 1b.
//
//   node scripts/perf-compile.mjs [distRoot]
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.argv[2] ?? path.join(ROOT, "packages/core/dist"));
const { compile, lookup, recordFor, render } = await import(
  url.pathToFileURL(path.join(dist, "comvi-core-internal.js")).href
);

const catalog = {};
for (let i = 0; i < 500; i++) {
  catalog[`static${i}`] = `Static text number ${i}`;
  catalog[`param${i}`] = `Hello, {name}! Item ${i}`;
  catalog[`plural${i}`] = `{count, plural, one {# item ${i}} other {# items ${i}}}`;
  catalog[`rich${i}`] = `Click <b>here</b> for {what} ${i}`;
}
const record = recordFor(catalog);
const keys = (prefix) => Array.from({ length: 500 }, (_, i) => `${prefix}${i}`);
const K = {
  static: keys("static"),
  param: keys("param"),
  plural: keys("plural"),
  rich: keys("rich"),
};
const P1 = { name: "Ann" };
const counts = Array.from({ length: 7 }, (_, n) => ({ count: n }));
const big = Array.from({ length: 7 }, (_, n) => ({ count: 1000 + n }));
const RICH = { what: "x", b: (c) => c };
const CASES = [
  ["static key", (i) => render(lookup(record, catalog, K.static[i % 500]), undefined, "en")],
  ["{name}", (i) => render(lookup(record, catalog, K.param[i % 500]), P1, "en")],
  ["plural (#)", (i) => render(lookup(record, catalog, K.plural[i % 500]), counts[i % 7], "en")],
  [
    "plural (#) de, n ≥ 1000",
    (i) => render(lookup(record, catalog, K.plural[i % 500]), big[i % 7], "de"),
  ],
  ["rich <b>", (i) => render(lookup(record, catalog, K.rich[i % 500]), RICH, "en")],
  ["cold compile (plural)", (i) => compile(`{n, plural, one {# a${i}} other {# b${i}}}`)],
];
const ITERS = 200_000;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(
  `perf-compile: node ${process.version}, load1 ${os.loadavg()[0].toFixed(1)}, ${ITERS} iterations × 5 runs`,
);
let sink = 0;
for (const [name, fn] of CASES) {
  for (let i = 0; i < 20_000; i++) sink += fn(i).length;
  const runs = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) sink += fn(i).length;
    runs.push(ITERS / ((performance.now() - t0) / 1000));
  }
  console.log(`${name.padEnd(26)} ${(median(runs) / 1e6).toFixed(2).padStart(7)} M ops/s`);
}
if (sink === -1) console.log(sink);
