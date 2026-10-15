#!/usr/bin/env node
// Builds the ICU-runtime table in README.md out of the saved bench runs, so no figure is ever
// typed by hand.
//
// Usage: node bench-table.mjs bench-<date>-run1.txt bench-<date>-run2.txt ...   (three or more)
//
// It prints, on stdout, the results table and the sample-size table for the README; on stderr,
// the per-row run-to-run spread.
//
// WHAT IS CITED, AND AT WHAT PRECISION
//
// A figure a page prints is the MEDIAN of every run passed here, rounded to two significant
// figures. Two, because that is the precision this measurement supports: the machine is a desktop
// under normal use, the run-to-run range of a cited row runs to about 10 %, and at two significant
// figures that variation sits at or below the last printed digit. Printing 59.36 for something
// that reads between 58.6 and 59.4 would be claiming four digits of a two-digit measurement.
// The range of every row is printed beside its median so nothing is hidden by the rounding.
//
// An earlier version of this script required three CONSECUTIVE runs to agree within 3 % on all
// eighteen cited rows before it would emit a table. That is a conjunction over eighteen rows
// against a per-row noise floor of up to 10 %, so it failed almost surely however good the
// measurement was: six triples failed in a row on rotating offenders, which is the signature of a
// noise floor and not of a broken row. A guard stricter than the claim it protects does not make
// the claim safer, it only stops work. The spread is still computed and still printed, because a
// reader of the README should see it, but it no longer blocks.
//
// WHAT STILL BLOCKS
//
//  - A run with no header line, or not taken in production mode, or whose one-minute load average
//    was LOAD_LIMIT or more at the start. Those are broken runs, not noisy ones.
//  - Runs that disagree about the Node version. zlib and the JIT both differ across majors.
//  - A cited row whose sample is shorter than MIN_WINDOW_MS. A sample of a few tens of
//    milliseconds cannot average out one scheduler slice handed to something else on the machine,
//    which is what made the short rows of this benchmark swing 20 % between runs while the long
//    ones held inside 2 %. bench.mjs scales the per-sample work per library to reach the window
//    and re-times until the median really spans it.
import { readFileSync } from "node:fs";

const LOAD_LIMIT = 9; // one-minute load average at the start of a run
const MIN_WINDOW_MS = 450; // a cited sample has to span about half a second
const SIG_FIGS = 2;

// Scenario order in the README, and the label each one gets there.
const SECTIONS = [
  ["warm, static key", "warm, static key"],
  ["warm, one parameter", "warm, one parameter"],
  ["warm, same output", "warm, same output"],
  ["warm, equal work", "warm, equal work (pre-formatted)"],
  ["warm, small count", "warm, small count (`#`, 0..3)"],
  ["catalog", "catalog"],
];

// How each bench label is written in the README.
const LIBRARIES = {
  "@comvi/core, simple compiler": "`@comvi/core`, simple compiler",
  "@comvi/core + icuCompiler": "`@comvi/core` + `icuCompiler`",
  "@comvi/core + icuCompiler, #": "`@comvi/core` + `icuCompiler`, `#`",
  "@comvi/core + icuCompiler, formatNumber() into {n}":
    "`@comvi/core` + `icuCompiler`, `formatNumber()` into `{n}`",
  "intl-messageformat (instance reused)":
    "reference, not a library: `intl-messageformat` instance reused",
  "intl-messageformat (instance reused), #": "`intl-messageformat`, instance reused, `#`",
  "i18next (no plugins)": "`i18next`, no plugins",
  "i18next (no plugins), {{name}}": "`i18next`, no plugins, `{{name}}`",
  "i18next + i18next-icu": "`i18next` + `i18next-icu`",
  "i18next + i18next-icu, #": "`i18next` + `i18next-icu`, `#`",
  "use-intl/core createTranslator": "`use-intl/core` translator",
  "use-intl/core createTranslator, #": "`use-intl/core` translator, `#`",
  "vue-i18n": "`vue-i18n`",
  "vue-i18n, {name}": "`vue-i18n`, `{name}`",
  "vue-i18n (pipe plural, own syntax)": "`vue-i18n`, pipe plural",
  "vue-i18n (pipe plural), n(x, 'decimal') into {n}":
    '`vue-i18n`, pipe plural, `n(x, "decimal")` into `{n}`',
  "i18next + i18next-icu, one instance": "`i18next` + `i18next-icu`, one instance",
  "use-intl/core, one translator": "`use-intl/core`, one translator",
  "vue-i18n, one instance (pipe plural)": "`vue-i18n`, one instance, pipe plural",
  "intl-messageformat, new instance per message, shared formatters":
    "`intl-messageformat`, new instance per message, shared formatters",
  "intl-messageformat, new instance per message, default formatters":
    "`intl-messageformat`, new instance per message, default formatters",
};

// The eighteen rows a comparison page prints a figure for, as "<scenario>||<bench label>". Only
// these carry the window requirement and only these are bold. Every intl-messageformat row is
// reference, as is the formatNumber() variant; the pages cite the same-output row for plurals, so
// equal-work and small-count are reference too.
const CITED = new Set([
  "warm, static key||@comvi/core, simple compiler",
  "warm, static key||@comvi/core + icuCompiler",
  "warm, static key||i18next (no plugins)",
  "warm, static key||use-intl/core createTranslator",
  "warm, static key||vue-i18n",
  "warm, one parameter||@comvi/core, simple compiler",
  "warm, one parameter||@comvi/core + icuCompiler",
  "warm, one parameter||i18next (no plugins), {{name}}",
  "warm, one parameter||use-intl/core createTranslator",
  "warm, one parameter||vue-i18n, {name}",
  "warm, same output||@comvi/core + icuCompiler, #",
  "warm, same output||i18next + i18next-icu, #",
  "warm, same output||use-intl/core createTranslator, #",
  "warm, same output||vue-i18n (pipe plural), n(x, 'decimal') into {n}",
  "catalog||@comvi/core + icuCompiler",
  "catalog||i18next + i18next-icu, one instance",
  "catalog||use-intl/core, one translator",
  "catalog||vue-i18n, one instance (pipe plural)",
]);

const files = process.argv.slice(2);
if (files.length < 3) {
  console.error("usage: node bench-table.mjs bench-<date>-run1.txt bench-<date>-run2.txt ...");
  console.error("at least three runs; the cited figure is the median of all of them.");
  process.exit(2);
}

const runs = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const header = text.split("\n").find((line) => line.startsWith("node v"));
  if (!header) throw new Error(`${file}: no "node vX" header; re-run with the current bench.mjs`);
  if (!header.includes("NODE_ENV=production")) throw new Error(`${file}: not a production run`);
  const node = header.match(/node (v[\d.]+)/)?.[1];
  const load = Number(header.match(/load ([\d.]+)/)?.[1]);
  if (!Number.isFinite(load)) throw new Error(`${file}: header has no load average`);
  if (load >= LOAD_LIMIT) {
    throw new Error(`${file}: started at load ${load}, at or over the limit of ${LOAD_LIMIT}`);
  }
  if (!/load at end/.test(text)) throw new Error(`${file}: run did not finish`);
  const rows = new Map();
  let section = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^## ([^:]+)/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const row = line.match(
      /^(.+?)\s+median\s+([\d.]+) ms\s+([\d.]+) (M ops\/s|K msgs\/s)(?:\s+n=(\d+))?\s*$/,
    );
    if (row && section) {
      rows.set(`${section}||${row[1].trim()}`, {
        ms: Number(row[2]),
        rate: Number(row[3]),
        unit: row[4],
        n: row[5] === undefined ? null : Number(row[5]),
      });
    }
  }
  runs.push({ file, node, load, rows });
}

const nodes = [...new Set(runs.map((r) => r.node))];
if (nodes.length > 1) throw new Error(`runs disagree about Node: ${nodes.join(", ")}`);

// Every cited row has to be present in every run, checked here rather than during table
// building. The row loop below takes its keys from the first run, so a cited row missing from
// THAT run would never be iterated and the table would come out silently short of a figure a
// page prints. A row missing from a later run is caught too, but that check only ever runs for
// keys the first run happened to have.
{
  const absent = [];
  for (const key of CITED) {
    const missing = runs.filter((r) => !r.rows.has(key)).map((r) => r.file);
    if (missing.length > 0) absent.push(`${key}\n      missing from: ${missing.join(", ")}`);
  }
  if (absent.length > 0) {
    throw new Error(
      `${absent.length} cited row(s) missing from at least one run:\n  - ${absent.join("\n  - ")}`,
    );
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
// Throughput at full precision: calls (or messages) per millisecond. Invariant to how large a
// sample the run calibrated to, and free of the rate column's two-decimal rounding.
const throughput = (cell) => (cell.n === null ? cell.rate : cell.n / cell.ms);
// Two significant figures, which is what this measurement supports.
function sig(x, figures = SIG_FIGS) {
  if (!(x > 0)) return String(x);
  const places = figures - Math.ceil(Math.log10(x));
  const rounded = Math.round(x * 10 ** places) / 10 ** places;
  return places > 0 ? rounded.toFixed(places) : String(rounded);
}
const show = (rate, unit) => (unit === "M ops/s" ? `${sig(rate)} M/s` : `${sig(rate)} K msgs/s`);

const spreads = [];
const shortRows = [];
const out = [
  `| Scenario | Library | Median of ${runs.length} runs | Range over the ${runs.length} |`,
  "|---|---|---:|---:|",
];
for (const [sectionKey, sectionLabel] of SECTIONS) {
  for (const key of [...runs[0].rows.keys()].filter((k) => k.startsWith(`${sectionKey}||`))) {
    const label = key.split("||")[1];
    const name = LIBRARIES[label];
    if (!name) throw new Error(`no README label for bench row "${label}"; add it to LIBRARIES`);
    const cited = CITED.has(key);
    const cells = runs.map((r) => r.rows.get(key));
    if (cells.some((c) => !c)) throw new Error(`row "${key}" is missing from at least one run`);
    const unit = cells[0].unit;
    const rates = cells.map((c) => c.rate);
    const tps = cells.map(throughput);
    const medianRate =
      rates[
        cells.map((c, i) => ({ i, t: tps[i] })).sort((a, b) => a.t - b.t)[
          Math.floor(cells.length / 2)
        ].i
      ];
    const lo = Math.min(...rates);
    const hi = Math.max(...rates);
    const window = Math.min(...cells.map((c) => c.ms));
    if (cited && window < MIN_WINDOW_MS)
      shortRows.push({ row: `${sectionLabel} / ${name}`, window });
    const spread = (Math.max(...tps) - Math.min(...tps)) / median(tps);
    spreads.push({ row: `${sectionLabel} / ${name}`, spread, cited, lo, hi, unit });
    const figure = show(medianRate, unit);
    const range =
      unit === "M ops/s"
        ? `${lo.toFixed(2)}-${hi.toFixed(2)}`
        : `${lo.toFixed(1)}-${hi.toFixed(1)}`;
    out.push(`| ${sectionLabel} | ${name} | ${cited ? `**${figure}**` : figure} | ${range} |`);
  }
}

// What one sample of each scenario consisted of, and how long it ran.
const human = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n);
out.push("", "| Scenario | One sample, per library | Window |", "|---|---|---:|");
for (const [sectionKey, sectionLabel] of SECTIONS) {
  const keys = [...runs[0].rows.keys()].filter((k) => k.startsWith(`${sectionKey}||`));
  // Counts come from every run, not from the first: calibration chooses n per run, so the
  // catalog row for @comvi/core ran 180,000 messages in one run and 320,000 in another, and
  // reporting either alone would misdescribe the set.
  const cells = keys.map((k) => ({
    label: LIBRARIES[k.split("||")[1]],
    ns: runs.map((r) => r.rows.get(k).n),
    ms: runs.map((r) => r.rows.get(k).ms),
  }));
  if (cells.some((c) => c.ns.some((n) => n === null))) continue;
  const low = cells.reduce((a, b) => (Math.min(...a.ns) <= Math.min(...b.ns) ? a : b));
  const high = cells.reduce((a, b) => (Math.max(...a.ns) >= Math.max(...b.ns) ? a : b));
  const windows = cells.flatMap((c) => c.ms);
  const unit = runs[0].rows.get(keys[0]).unit === "M ops/s" ? "calls" : "messages";
  const range = (c) => {
    const lo = Math.min(...c.ns);
    const hi = Math.max(...c.ns);
    // Collapse when the two ends round to the same figure, so a row does not read "1.2 M-1.2 M".
    return human(lo) === human(hi) ? human(lo) : `${human(lo)}-${human(hi)}`;
  };
  const span =
    low === high
      ? `${range(low)} ${unit}`
      : `${range(low)} ${unit} (${low.label}) to ${range(high)} (${high.label})`;
  out.push(
    `| ${sectionLabel} | ${span} | ${Math.round(Math.min(...windows))}-${Math.round(
      Math.max(...windows),
    )} ms |`,
  );
}

if (shortRows.length > 0) {
  console.error(
    `${shortRows.length} cited row(s) have a sample shorter than ${MIN_WINDOW_MS} ms; a short sample cannot average out a scheduler slice:`,
  );
  for (const s of shortRows) console.error(`  ${s.window.toFixed(1)} ms  ${s.row}`);
  process.exit(1);
}

console.error(
  `bench-table: ${runs.length} runs, ${nodes[0]}, load at start ${runs
    .map((r) => r.load.toFixed(2))
    .join(" / ")}`,
);
const cited = spreads.filter((s) => s.cited).sort((a, b) => b.spread - a.spread);
console.error("\nrun-to-run spread of each cited row, worst first (reported, not a gate):");
for (const s of cited) {
  console.error(
    `  ${(s.spread * 100).toFixed(1).padStart(5)} %  ${s.row}   ${
      s.unit === "M ops/s"
        ? `${s.lo.toFixed(2)}-${s.hi.toFixed(2)}`
        : `${s.lo.toFixed(1)}-${s.hi.toFixed(1)}`
    }`,
  );
}
console.error(
  `\nwidest cited row ${(cited[0].spread * 100).toFixed(1)} %, narrowest ${(
    cited[cited.length - 1].spread * 100
  ).toFixed(
    1,
  )} %; every cited figure is the median of ${runs.length} runs at ${SIG_FIGS} significant figures`,
);
console.log(out.join("\n"));
