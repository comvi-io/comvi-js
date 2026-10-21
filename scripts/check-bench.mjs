#!/usr/bin/env node
// Timing for `comvi check`'s engine — a measurement, NOT a gate: no threshold,
// not wired into test, test:commit or CI. Machine-independent guards live in
// packages/cli/tests/check/caching.test.ts (call counts, not milliseconds).
//
//   pnpm build && node scripts/check-bench.mjs [--keys 2000] [--locales 11] [--runs 7]
//
// Runs the BUILT engine (packages/cli/dist) over a synthetic catalog of plain,
// parameter, plural, select and tag messages, every target missing a tenth of
// the keys. The first call is reported as cold; the timed runs follow it. It
// prints the median and min/max of those, and `node --version`, since timings
// move with the Node major and the machine.
import path from "node:path";
import url from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
}

const keys = flag("keys", 2000);
const localeCount = flag("locales", 11);
const runs = flag("runs", 7);

const { CatalogCheck } = await import(
  url.pathToFileURL(path.join(ROOT, "packages/cli/dist/index.js")).href
);

const shapes = [
  (i) => `Plain message number ${i}`,
  (i) => `Hello {name}, you have {count} items (${i})`,
  (i) => `{count, plural, one {# file} other {# files}} ${i}`,
  (i) => `{gender, select, female {She} male {He} other {They}} ${i}`,
  (i) => `Read the <link>terms ${i}</link> and <b>agree</b>`,
];
const locales = ["en", ...Array.from({ length: localeCount - 1 }, (_, i) => `l${i}`)];
const translations = {};
for (const [index, locale] of locales.entries()) {
  const catalog = {};
  for (let i = 0; i < keys; i++) {
    if (index > 0 && i % 10 === index % 10) continue;
    catalog[`section${i % 40}.key${i}`] = shapes[i % shapes.length](i);
  }
  translations[locale] = { default: catalog };
}

const run = () =>
  CatalogCheck.run({
    translations,
    source: "en",
    targets: locales.slice(1),
    namespaces: ["default"],
  });
const time = () => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

const cold = time();
const timed = Array.from({ length: runs }, time).sort((a, b) => a - b);
const median = timed[Math.floor(timed.length / 2)];
const ms = (value) => `${value.toFixed(1)} ms`;

console.log(`comvi check engine: ${keys} keys × ${localeCount} locales, ${runs} runs`);
console.log(`node ${process.version}`);
console.log(`cold ${ms(cold)}  median ${ms(median)}  min ${ms(timed[0])}  max ${ms(timed.at(-1))}`);
console.log(
  JSON.stringify({
    keys,
    locales: localeCount,
    runs,
    node: process.version,
    cold,
    median,
    min: timed[0],
    max: timed.at(-1),
  }),
);
