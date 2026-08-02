/**
 * CI guard for the release plan changesets will apply. Two assertions:
 *
 * 1. The planned bump must not exceed the bump the changeset files declare.
 *    The classic failure: a pinned @comvi/* peer range falls out of the next
 *    version's range and changesets silently escalates the whole fixed group
 *    to a major.
 * 2. @comvi/core must actually be in the plan, at the declared bump, landing
 *    on the branch's next version. @comvi/core is a member of the `fixed`
 *    group in .changeset/config.json, so every release publishes it — an
 *    absent or under-bumped core entry means the changeset set is broken, and
 *    assertion 1 alone would not notice because the other eleven packages
 *    still carry the bump.
 *
 * The target version is derived from the branch's own manifest
 * (nextReleaseVersion), never pinned and never read off npm: the branch is
 * routinely out of step with the published line.
 *
 * Simulates the release path (sync-peer-ranges + changeset status), then
 * restores the working tree.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { declaredMaxBump, nextReleaseVersion, syncPeerRanges } from "./sync-peer-ranges.mjs";

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

// --- assertion 2: the specific @comvi/core entry (Phase-7 acceptance A9) ---
const CORE = "@comvi/core";
const core = plan.releases.find((r) => r.name === CORE);
const expectedVersion = nextReleaseVersion();

if (!core) {
  console.error(
    `check-release-plan: the release plan contains no ${CORE} entry. ` +
      `${CORE} is in the \`fixed\` group, so every release must publish it — ` +
      `a missing entry means no changeset reaches it (deleted or mis-scoped frontmatter).`,
  );
  process.exit(1);
}

if (ORDER[core.type] !== declared || core.newVersion !== expectedVersion) {
  console.error(
    `check-release-plan: expected ${CORE} ${core.oldVersion} -> ${expectedVersion} (${name(declared)}) ` +
      `but the plan says ${core.oldVersion} -> ${core.newVersion} (${core.type}).`,
  );
  process.exit(1);
}

console.log(
  `check-release-plan: ${CORE} ${core.oldVersion} -> ${core.newVersion} (${core.type}), ` +
    `from ${core.changesets.length} changeset(s): ${core.changesets.join(", ")}`,
);

console.log(`check-release-plan: OK (declared ${name(declared)}, planned ${name(planned)})`);
