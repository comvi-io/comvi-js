/**
 * CI guard: the release bump changesets will apply must not exceed the bump
 * the changeset files declare. The classic failure: a pinned @comvi/* peer
 * range falls out of the next version's range and changesets silently
 * escalates the whole fixed group to a major.
 *
 * Simulates the release path (sync-peer-ranges + changeset status), then
 * restores the working tree.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { declaredMaxBump, syncPeerRanges } from "./sync-peer-ranges.mjs";

const ORDER = { patch: 1, minor: 2, major: 3 };
const declared = declaredMaxBump();

if (declared === 0) {
  console.log("check-release-plan: no changesets, nothing to verify");
  process.exit(0);
}

// Snapshot every package manifest so the simulation can be undone without
// touching git state (a `git checkout` here would clobber uncommitted work).
const backups = new Map();
for (const entry of fs.readdirSync("packages")) {
  const p = path.join("packages", entry, "package.json");
  if (fs.existsSync(p)) backups.set(p, fs.readFileSync(p, "utf8"));
}

// `changeset status` resolves baseBranch ("main") — in CI the checkout is a
// detached HEAD without a local main, so materialize the ref first.
execSync(
  "git rev-parse --verify main || git branch main origin/main || git fetch origin main:main",
  {
    stdio: "ignore",
  },
);

const planFile = "release-plan.tmp.json";
let plan;
try {
  syncPeerRanges();
  execSync(`npx changeset status --output=${planFile}`, { stdio: "pipe" });
  plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
} finally {
  fs.rmSync(planFile, { force: true });
  for (const [p, content] of backups) fs.writeFileSync(p, content);
}

const planned = Math.max(0, ...plan.releases.map((r) => ORDER[r.type] ?? 0));
const name = (n) => Object.keys(ORDER).find((k) => ORDER[k] === n) ?? "none";

if (planned > declared) {
  const escalated = plan.releases
    .filter((r) => ORDER[r.type] > declared)
    .map((r) => `${r.name}: ${r.oldVersion} -> ${r.newVersion} (${r.type})`);
  console.error(
    `check-release-plan: changesets declare at most "${name(declared)}" but the release plan ` +
      `contains "${name(planned)}" bumps:\n  ${escalated.join("\n  ")}\n` +
      `Likely cause: an internal peer range that the next version does not satisfy ` +
      `(see scripts/sync-peer-ranges.mjs).`,
  );
  process.exit(1);
}

console.log(`check-release-plan: OK (declared ${name(declared)}, planned ${name(planned)})`);
