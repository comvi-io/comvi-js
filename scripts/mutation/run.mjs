#!/usr/bin/env node
// Mutation testing (Stryker) for one package: `pnpm mutation packages/core [-- extra stryker args]`.
// Runs from the package directory so `mutate` globs and the package's vitest.config.ts apply;
// reports land in <package>/.stryker/ (gitignored). Manual / nightly tool — deliberately not a CI gate.
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { applyAccepted } from "./accept.mjs";

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
// Packages whose vitest config aliases a sibling's src (`@comvi/core` → ../core/src) mutate
// in place: Stryker's sandbox copies the package alone, so the alias would point nowhere.
const IN_PLACE = new Set(["packages/react"]);
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
    ...(IN_PLACE.has(pkg.replace(/\/$/, "")) && !rest.includes("--inPlace") ? ["--inPlace"] : []),
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
 * Re-reads Stryker's JSON report and applies scripts/mutation/accepted.json (accept.mjs: an
 * entry accepts one mutant per listed mutator on ONE line of its file, or exactly the mutants
 * it pins by column and replacement), so the printed score is the honest one and the survivor
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
  const { rows, totals, survivors, stale } = applyAccepted(report.files, accepted, cwd);
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
  if (stale.length) {
    console.log(
      `\nStale accepted entries (${stale.length}) — no surviving mutant matched; delete or fix them:`,
    );
    for (const s of stale) console.log("  " + s);
  }
}
