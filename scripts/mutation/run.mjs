#!/usr/bin/env node
// Mutation testing (Stryker) for one package: `pnpm mutation packages/core [-- extra stryker args]`.
// Runs from the package directory so `mutate` globs and the package's vitest.config.ts apply;
// reports land in <package>/.stryker/ (gitignored). Manual / nightly tool — deliberately not a CI gate.
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const [pkg, ...rest] = process.argv.slice(2);
if (!pkg) {
  console.error("usage: pnpm mutation <packages/dir|apps/dir> [-- stryker args]");
  process.exit(2);
}
const cwd = path.resolve(ROOT, pkg);
if (!fs.existsSync(path.join(cwd, "vitest.config.ts"))) {
  console.error(`${pkg}: no vitest.config.ts — mutation testing needs a vitest package`);
  process.exit(2);
}
const config = path.join(ROOT, "scripts/mutation/stryker.config.json");
// pnpm keeps root devDependencies out of a package's node_modules, so the runner plugin is
// resolved from the root and handed to Stryker by absolute path.
const runnerPlugin = createRequire(path.join(ROOT, "package.json")).resolve(
  "@stryker-mutator/vitest-runner",
);
if (rest.includes("--summarize-only")) {
  summarize(cwd, pkg);
  process.exit(0);
}
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "stryker",
    "run",
    config,
    "--plugins",
    runnerPlugin,
    ...rest.filter((a) => a !== "--" && a !== "--summarize-only"),
  ],
  {
    cwd,
    stdio: "inherit",
    // Wrapper vitest configs exclude build-artifact tests (they exercise dist,
    // not the mutated src) when this is set — declared policy instead of the
    // runner silently dropping files that cannot load in the sandbox.
    env: { ...process.env, COMVI_MUTATION: "1" },
  },
);
if (result.status === 0) summarize(cwd, pkg);
process.exit(result.status ?? 1);

/**
 * Re-reads Stryker's JSON report and applies scripts/mutation/accepted.json: an accepted entry
 * matches ONE line of its file by text (lineHint breaks ties) and turns the listed mutators'
 * survivors on that line into "accepted", so the printed score is the honest one and the survivor
 * list is the actionable one. Stale entries (matching no surviving mutant) are reported so the
 * list cannot rot.
 */
function summarize(cwd, pkg) {
  const reportPath = path.join(cwd, ".stryker/report.json");
  const acceptedPath = path.join(ROOT, "scripts/mutation/accepted.json");
  if (!fs.existsSync(reportPath)) return;
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const accepted = fs.existsSync(acceptedPath)
    ? JSON.parse(fs.readFileSync(acceptedPath, "utf8")).entries.filter((e) => e.package === pkg)
    : [];
  const used = new Set();
  const rows = [];
  const survivors = [];
  const totals = { killed: 0, survived: 0, accepted: 0, nocov: 0 };
  for (const [file, entry] of Object.entries(report.files)) {
    const rel = path.relative(cwd, path.resolve(cwd, file));
    const source = (entry.source ?? "").split("\n");
    const row = { file: rel, killed: 0, survived: 0, accepted: 0, nocov: 0 };
    const boundLine = new Map();
    for (const m of entry.mutants) {
      if (m.status === "Killed" || m.status === "Timeout") row.killed++;
      else if (m.status === "Survived" || m.status === "NoCoverage" || m.status === "Ignored") {
        const line = m.location.start.line;
        const text = (source[line - 1] ?? "").trim();
        let best = -1;
        let bestDist = Infinity;
        accepted.forEach((e, i) => {
          if (e.file !== rel || e.snippet !== text) return;
          if (!e.mutators.includes("all") && !e.mutators.includes(m.mutatorName)) return;
          const bound = boundLine.get(i);
          if (bound !== undefined && bound !== line) return;
          const dist = Math.abs((e.lineHint ?? line) - line);
          if (dist < bestDist) {
            best = i;
            bestDist = dist;
          }
        });
        if (best >= 0) {
          boundLine.set(best, line);
          used.add(best);
          row.accepted++;
        } else if (m.status === "NoCoverage") {
          row.nocov++;
        } else if (m.status === "Survived") {
          row.survived++;
          survivors.push(
            `${rel}:${line} ${m.mutatorName} -> ${(m.replacement ?? "").split("\n")[0].slice(0, 70)}`,
          );
        }
      }
    }
    for (const k of Object.keys(totals)) totals[k] += row[k];
    rows.push(row);
  }
  const pct = (num, den) => (den ? ((100 * num) / den).toFixed(1) : "n/a");
  const score = (r) => pct(r.killed, r.killed + r.survived + r.nocov);
  const covered = (r) => pct(r.killed, r.killed + r.survived);
  console.log("\nAdjusted for accepted mutants (scripts/mutation/accepted.json):");
  console.log("file | killed | survived | accepted | nocov | score% | covered%");
  for (const r of rows.sort((a, b) => b.survived + b.nocov - (a.survived + a.nocov))) {
    console.log(
      `${r.file} | ${r.killed} | ${r.survived} | ${r.accepted} | ${r.nocov} | ${score(r)} | ${covered(r)}`,
    );
  }
  console.log(
    `ALL | ${totals.killed} | ${totals.survived} | ${totals.accepted} | ${totals.nocov} | ${score(totals)} | ${covered(totals)}`,
  );
  if (survivors.length) {
    console.log(`\nReal survivors (${survivors.length}) — each is a claim the tests do not make:`);
    for (const s of survivors) console.log("  " + s);
  }
  const stale = accepted
    .map((e, i) =>
      used.has(i) ? null : `${e.file} [${e.mutators.join(",")}] "${e.snippet.slice(0, 60)}"`,
    )
    .filter(Boolean);
  if (stale.length) {
    console.log(
      `\nStale accepted entries (${stale.length}) — no surviving mutant matched; delete or fix them:`,
    );
    for (const s of stale) console.log("  " + s);
  }
}
