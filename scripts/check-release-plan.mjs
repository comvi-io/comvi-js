/**
 * CI guard for the release plan changesets will apply. Three assertions:
 *
 * 0. G7 (framework-slim plan §6) — no release-facing text carries a stale
 *    claim the wave falsified: wrappers/bindings requiring a full root entry,
 *    "vanilla-only" slim, or a 0.6.0 target. Runs first and unconditionally,
 *    because a stale CHANGELOG claim is unrecallable once published, and it
 *    self-tests against two verbatim pre-wave claims before it may pass
 *    anything (scripts/g7-canaries.json).
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

// --- assertion 0: G7 release-facing stale-claim grep (plan §6) -------------
//
// Corpus, patterns, allowlist shape and the canary self-test are all fixed by
// the plan. Two rules make this a gate rather than a lint:
//   * the canary self-test runs FIRST and the whole check fails if either
//     verbatim pre-wave claim escapes the pattern set — a pattern set that
//     matches nothing proves nothing (the Revision-2 set matched neither);
//   * every allowlist entry names file + line + pattern + reason. Blanket
//     excludes are prohibited: a moved line must be re-reviewed, not inherited.

const G7_PATTERNS = [
  // A wave that folded into 0.5.0 must not point anyone at a 0.6.0 target.
  { name: "0.6.0-reference", source: String.raw`0\.6\.0` },
  // The claim shape itself. The gap is 120 chars because canary 1 puts 95
  // characters of package list between "bindings" and "require".
  { name: "bindings-require", source: String.raw`(wrappers?|bindings?).{0,120}require` },
  { name: "full-root", source: String.raw`full root` },
  { name: "requires-root-entry", source: String.raw`require[s]? the root entry` },
  { name: "vanilla-scope", source: String.raw`vanilla[-/ ]` },
].map((p) => ({ ...p, re: new RegExp(p.source, "gis") }));

/** @returns {Array<{pattern: string, index: number, text: string}>} */
function g7Scan(text) {
  const hits = [];
  for (const { name, re } of G7_PATTERNS) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      hits.push({ pattern: name, index: match.index, text: match[0] });
    }
  }
  return hits;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const oneLine = (s) => s.replace(/\s+/g, " ").trim();

/** README.md, MIGRATION.md, packages/&#42;/README.md, .changeset/&#42;&#42;/&#42;.md. */
function g7Corpus() {
  const files = ["README.md", "MIGRATION.md"];
  for (const entry of fs.readdirSync("packages")) {
    const readme = path.join("packages", entry, "README.md");
    if (fs.existsSync(readme)) files.push(readme);
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".md")) files.push(p);
    }
  };
  walk(".changeset");
  return files.filter((f) => fs.existsSync(f)).sort();
}

// Every entry: file + line + pattern + reason. Never a bare file or glob.
const G7_ALLOWLIST = [
  {
    file: ".changeset/next-unified-plugin-use.md",
    line: 30,
    pattern: "0.6.0-reference",
    reason:
      "Annotated forward-pointer, not a stale claim: the entry deprecates useClient/useServer/useClientLazy/useServerLazy and names the release that removes them. The framework-slim wave folded into 0.5.0 and does not touch that deprecation window.",
  },
  // `vanilla[-/ ]` exists to catch "slim is for vanilla/direct usage only".
  // These six are the word's other, legitimate job in this repo: an audience
  // label and a permanent docs path. Each is listed individually — a blanket
  // "vanilla is fine" exclude would have let the pre-wave claim through too.
  {
    file: "README.md",
    line: 51,
    pattern: "vanilla-scope",
    reason:
      'Install-matrix audience label "Vanilla / Node" — names who installs @comvi/core directly, asserts nothing about which hosts the bindings accept.',
  },
  {
    file: "README.md",
    line: 93,
    pattern: "vanilla-scope",
    reason: "Documentation URL comvi.io/docs/i18n/vanilla/ — a permanent docs path, not a claim.",
  },
  {
    file: "README.md",
    line: 181,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL in the package table's docs column — a permanent docs path, not a claim.",
  },
  {
    file: "packages/core/README.md",
    line: 20,
    pattern: "vanilla-scope",
    reason:
      'Describes when to install @comvi/core directly ("running Comvi i18n in vanilla Node/browser code"). A use case for the package, not a restriction on /slim — the same paragraph names all six bindings as transitive consumers.',
  },
  {
    file: "packages/core/README.md",
    line: 41,
    pattern: "vanilla-scope",
    reason: "Documentation URL comvi.io/docs/i18n/vanilla/ — a permanent docs path, not a claim.",
  },
  {
    file: "packages/core/README.md",
    line: 383,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL in the full-API pointer at the end of the README — a permanent docs path, not a claim.",
  },
];

function runG7() {
  // (a) Canary self-test — the gate may not pass anything until it proves the
  //     pattern set catches the exact claims it exists to kill.
  const fixture = JSON.parse(fs.readFileSync("scripts/g7-canaries.json", "utf8"));
  const canaryFailures = [];
  for (const canary of fixture.canaries) {
    const matched = new Set(g7Scan(canary.text).map((h) => h.pattern));
    if (matched.size === 0) {
      canaryFailures.push(`${canary.origin}: matched by NO pattern`);
      continue;
    }
    if (!matched.has("bindings-require")) {
      canaryFailures.push(
        `${canary.origin}: not matched by the claim-shape pattern "bindings-require" ` +
          `(matched ${[...matched].join(", ")}) — the .{0,120} gap regressed`,
      );
      continue;
    }
    console.log(`G7 canary OK  ${canary.origin} — matched by ${[...matched].sort().join(", ")}`);
  }
  if (canaryFailures.length > 0) {
    console.error(
      `G7: canary self-test FAILED — the pattern set does not catch the pre-wave claims it ` +
        `exists to kill, so a clean corpus would prove nothing:\n  ${canaryFailures.join("\n  ")}\n` +
        `Fixtures: scripts/g7-canaries.json (captured at ${fixture.capturedFrom.commit}).`,
    );
    process.exit(1);
  }

  // (b) Corpus scan.
  const corpus = g7Corpus();
  const unusedAllowlist = new Set(G7_ALLOWLIST.map((a) => `${a.file}:${a.line}:${a.pattern}`));
  const failures = [];
  for (const file of corpus) {
    const text = fs.readFileSync(file, "utf8");
    for (const hit of g7Scan(text)) {
      const line = lineOf(text, hit.index);
      const key = `${file}:${line}:${hit.pattern}`;
      if (unusedAllowlist.delete(key)) continue;
      failures.push(`${file}:${line} [${hit.pattern}] ${oneLine(hit.text)}`);
    }
  }
  if (failures.length > 0) {
    console.error(
      `G7: ${failures.length} stale release-facing claim(s) — these ship into the published ` +
        `CHANGELOG/README and cannot be recalled:\n  ${failures.join("\n  ")}\n` +
        `Fix the text, or add a file:line+pattern allowlist entry with a reason in ` +
        `scripts/check-release-plan.mjs (G7_ALLOWLIST).`,
    );
    process.exit(1);
  }
  if (unusedAllowlist.size > 0) {
    console.error(
      `G7: ${unusedAllowlist.size} allowlist entr(ies) matched nothing — a stale allowlist is a ` +
        `silent hole:\n  ${[...unusedAllowlist].join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(
    `G7: OK — ${corpus.length} release-facing file(s) clean against ${G7_PATTERNS.length} ` +
      `pattern(s), ${G7_ALLOWLIST.length} annotated allowlist entr(ies).`,
  );
}

runG7();

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
