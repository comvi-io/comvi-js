/**
 * CI guard for the release plan changesets will apply. Three assertions:
 *
 * 0. G7 (framework-slim plan §6, extended by the single-entry convergence) — no
 *    release-facing text carries a stale claim a wave falsified: wrappers or
 *    bindings requiring a full root entry, "vanilla-only" slim, a 0.6.0 target,
 *    a root that is batteries-included / composes capabilities / registers,
 *    runs or carries ambient tags, a comparison whose two sides are the same
 *    current specifier, a second entry named `@comvi/core`, or a graph, entry or
 *    factory sold as "root-free" when core's base entry is where `createI18n`
 *    lives — that last family however it is spelled, including the dist file
 *    name (`comvi-core.js` … absent), the entry put out under its other name
 *    ("keeps the core entry out") and the bare pronoun form ("without either").
 *    Runs first and
 *    unconditionally, because a stale CHANGELOG claim is unrecallable once
 *    published, and it self-tests against every recorded claim in
 *    scripts/g7-canaries.json before it may pass anything. That fixture spans
 *    three capture waves, so each row carries its own capture commit and the
 *    gate reports it per row — no single commit stands for the whole file.
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
//   * the canary self-test runs FIRST and the whole check fails if ANY of the
//     captured verbatim claims escapes the pattern set — a pattern set that
//     matches nothing proves nothing (the Revision-2 set matched neither of the
//     first two), and each canary names the family that must catch it, so one
//     wave's claim can never be proved by another wave's pattern;
//   * every allowlist entry names file + line + pattern + reason. Blanket
//     excludes are prohibited: a moved line must be re-reviewed, not inherited.

// The bare root specifier exactly as prose and tables write it. `@comvi/core`
// followed by a `/` is a capability subpath and never the host under discussion,
// so the trailing backtick is load-bearing: it is what keeps the one sanctioned
// `@comvi/core/slim` deletion-history mention out of these patterns.
const G7_CORE = "`@comvi/core`";

// A markdown table cell that names the bare root specifier AND a host qualifier,
// in either order ("| `@comvi/core` (root) |" and "| react + bare `@comvi/core` |"
// both qualify). Two lookaheads instead of an order-specific alternation.
const g7QualifiedCell = (qualifiers) =>
  "\\|(?=[^|\\n]*" + G7_CORE + ")(?=[^|\\n]*\\b(?:" + qualifiers + ")\\b)[^|\\n]*";
const g7BaseCell = g7QualifiedCell("bare|base");
const g7RootCell = g7QualifiedCell("root|composed");

// The absence predicate, shared by every alternative of the `root-free` family
// below. `be` covers the modal forms the reviews actually found ("must still be
// absent"), not just the indicative ones.
const G7_ABSENT = String.raw`(is|are|be|stays?|remains?|kept)\s+absent`;
// A gap that ends at a SENTENCE period but not at a period inside a word —
// `comvi-core.js`, `createNextI18n.js`, `0.4`. Without that exception a plain
// `[^.]` gap cannot span the base entry's own dist FILE NAME, which is exactly
// how one absence claim escaped every noun-anchored pattern.
const G7_TOKEN_GAP = String.raw`(?:[^.]|\.(?=\w))`;

const G7_PATTERNS = [
  // A wave that folded into 0.5.0 must not point anyone at a 0.6.0 target.
  { name: "0.6.0-reference", source: String.raw`0\.6\.0` },
  // The claim shape itself. The gap is 120 chars because canary 1 puts 95
  // characters of package list between "bindings" and "require".
  { name: "bindings-require", source: String.raw`(wrappers?|bindings?).{0,120}require` },
  { name: "full-root", source: String.raw`full root` },
  { name: "requires-root-entry", source: String.raw`require[s]? the root entry` },
  { name: "vanilla-scope", source: String.raw`vanilla[-/ ]` },
  // ── the `root-full` family, activated by single-entry P1 ──
  // The root entry is the BASE host now. Any release-facing text that still
  // sells it as the batteries-included one, or says it composes capabilities
  // back in, points a reader at semantics that no longer exist. Both patterns
  // are tight on purpose so the deliberate CDN-global exception survives: the
  // README's "serve a batteries-included bundle built from its own entry" puts
  // ~30 characters between the two words, outside the 20-character window, and
  // it claims nothing about the root composing anything.
  {
    name: "root-is-batteries",
    source: String.raw`(batteries[^.\n]{0,20}entr(y|ies)|entr(y|ies)[^.\n]{0,20}batteries)`,
  },
  { name: "root-composes", source: String.raw`root [^.\n]{0,20}entry composes` },
  // Widened after the P1 review found live claim shapes the two patterns above
  // missed. Each has its own canary in scripts/g7-canaries.json, so each is
  // proved against the exact sentence it exists to kill.
  {
    name: "root-ships-capabilities",
    source: String.raw`root[^.]{0,40}(ships|has|carries)[^.]{0,40}capabilit`,
  },
  { name: "with-on-root-noop", source: String.raw`\.with\([^)]{0,20}\)[^.]{0,30}on\s+an?\s+root` },
  {
    name: "root-behaviour-unchanged",
    source: String.raw`root[^.]{0,20}behavi\w{0,4} is unchanged`,
  },
  // Two more live shapes the second review found: a root that "is unchanged /
  // keeps full ICU", and a root that registers tag syntax itself. Both are
  // false after the cutover; both own a canary in scripts/g7-canaries.json.
  {
    name: "root-unchanged-full-icu",
    source: String.raw`root[^.]{0,60}(unchanged|keeps?)[^.]{0,60}(full|ICU)`,
  },
  { name: "root-registers-tags", source: String.raw`root[^.]{0,40}registers? tag` },
  // ── the same-specifier / ambient-tag family, activated by the third review
  //    round (agent://P1FinalReview) ──
  // The `/slim` -> root token swap left live shapes none of the patterns above
  // can see, because each of those needs a specific verb or noun. These five are
  // shaped around the SEMANTICS instead, and each owns its own canary in
  // scripts/g7-canaries.json, captured verbatim from the tree that carried it.
  //
  // The base host does not register tag syntax on import, so a root that "runs"
  // or "carries"/"retains" core's ambient registration is as false as one that
  // "registers" it — `root-registers-tags` only ever saw the third verb.
  {
    name: "root-runs-ambient-tags",
    source: String.raw`root[^.]{0,40}runs?[^.]{0,40}(ambient|registerTagSyntax)`,
  },
  {
    name: "root-carries-ambient-tags",
    source:
      String.raw`(root[^.]{0,40}(carry|carries|carrying|retain\w*|inherit\w*)` +
      String.raw`|(retain\w*|inherit\w*)[^.]{0,20}root)` +
      String.raw`[^.]{0,60}(ambient|tag registration|tag syntax)`,
  },
  // A comparison whose two sides are the SAME current specifier is unreadable as
  // anything true: after the convergence there is one `@comvi/core` and it IS the
  // base host. In prose the two mentions sit in one sentence (the period bound is
  // what lets the scream changeset state the break across two sentences); in a
  // table they sit in sibling columns of one row or in adjacent rows.
  { name: "same-specifier-hosts", source: G7_CORE + "[^`.]{0,60}" + G7_CORE },
  {
    name: "same-specifier-table",
    source: [
      g7BaseCell + "(?:\\|[^|\\n]*){0,2}" + g7RootCell,
      g7RootCell + "(?:\\|[^|\\n]*){0,2}" + g7BaseCell,
      g7BaseCell + "[^\\n]*\\n" + g7RootCell,
      g7RootCell + "[^\\n]*\\n" + g7BaseCell,
    ].join("|"),
  },
  // There is no second entry named `@comvi/core` to delete. The entry that was
  // deleted is `@comvi/core/slim`, which the negative lookahead lets through —
  // that is the one sanctioned deletion-history mention (the scream changeset).
  { name: "second-core-entry", source: String.raw`second[^.]{0,40}@comvi/core(?![\w/-])` },
  // ── the `root-free` family, activated by the fourth review round and
  //    broadened by the fifth (agent://P1ExhaustiveReview) ──
  // Core's base entry is in EVERY comvi graph that constructs a host, because
  // `createI18n` IS its export and no wrapper ships a host constructor of its
  // own: wrapper `/slim` entries and both `@comvi/next` entries all reach that
  // one. Some re-export it by name (`createCore`, `createSlimI18n`); some call
  // it inside their own preset module (vue's `createI18nSlim` builds a
  // `VueI18n` around it, and `slim.ts` re-exports it as `createCore` besides).
  // Either way the module is in the graph. So no factory, entry, app or graph
  // is "root-free", and no fixture asserts that entry absent: what the
  // sentinels exclude is the tag-registration pair, the unused capability
  // subpaths and next's own composed builder. This is the shape all seventeen
  // patterns above missed — its canary escaped the whole set — because each of
  // them needs a verb ("composes", "registers", "carries") or the bare
  // specifier in a table cell, and this claim needs neither.
  //
  // The fifth round then found the SAME claim in three costumes that never say
  // the word "root", each of which the three alternatives below let through. One
  // rule, six spellings, a canary per materially distinct one:
  //   a. the literal wording — `root-free`, "no root entry", "root entry is
  //      absent" (the first three alternatives, unchanged);
  //   b. the dist FILE NAME — "`comvi-core.js` … are absent" — which is how the
  //      react/solid/svelte "Measured" sections spelled it;
  //   c. the entry under its other name, put OUT — "keeps the core entry out".
  //      The noun `entry` is the discriminator and it is load-bearing: "the main
  //      entry tree-shakes core out of a `createI18nFromCore`-only app" stays
  //      TRUE (nothing there constructs a host, so the module is unreachable),
  //      while naming the ENTRY and putting it out asserts a module absence that
  //      cannot survive a single `createI18n` call;
  //   d. a bare PRONOUN — "… and injection key without either" — whose two
  //      referents sit in an earlier sentence, outside every noun window. The
  //      rule it enforces is that prose excluding two things must NAME them,
  //      which is why it needs no context of its own to be sound.
  // They stay ONE family on purpose: it is one false claim, so one pattern name
  // carries it and a regression in any costume reports as the same rule.
  {
    name: "root-free",
    source: [
      String.raw`\broot[-\s]?(free|less)\b`,
      // `\b` on both sides of the negation is load-bearing: without the trailing
      // one, "isVirtualNode` is now exported from the root entry" — a true claim —
      // matched on the "No" inside "Node".
      String.raw`\b(no|not|without|never names?|free of|neither)\b[^.\n]{0,30}\broot\s+(entry|constructor|import|graph|factory|host)`,
      String.raw`\broot\s+(entry|constructor|import|graph|host)[^.\n]{0,30}` + G7_ABSENT,
      String.raw`\bcomvi-core\.js` + G7_TOKEN_GAP + "{0,40}" + G7_ABSENT,
      String.raw`\b(core|root|base)\s+entry\s+out\b`,
      String.raw`\bwithout either\b`,
    ].join("|"),
  },
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
    line: 474,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL in the full-API pointer at the end of the README — a permanent docs path, not a claim. RE-REVIEWED at framework-slim tier-3 (383 -> 433, slim section grew), at the framework-slim DX pass (433 -> 464, the single-package section landed) at DX-2 (464 -> 491, the `.with(installer)` section landed) and at single-entry P1 (491 -> 474, the two-tier slim section collapsed into the one-entry section, the quickstart gained its ICU note, and the review round added the measured-run pointer); the line itself is byte-identical every time and still a bare docs URL.",
  },
];

function runG7() {
  // (a) Canary self-test — the gate may not pass anything until it proves the
  //     pattern set catches the exact claims it exists to kill.
  const fixture = JSON.parse(fs.readFileSync("scripts/g7-canaries.json", "utf8"));
  const waves = new Map(fixture.captureWaves.map((w) => [w.id, w]));
  const canaryFailures = [];
  for (const canary of fixture.canaries) {
    // Provenance is part of the fixture's contract: the rows were captured at
    // three different commits, so a row that cannot resolve its own wave would
    // be reported under someone else's tree. Fail rather than guess.
    const wave = waves.get(canary.wave);
    if (!wave) {
      canaryFailures.push(
        `${canary.origin}: capture wave "${canary.wave}" is not declared in captureWaves`,
      );
      continue;
    }
    const where = `${canary.origin} @ ${wave.commit}`;
    const matched = new Set(g7Scan(canary.text).map((h) => h.pattern));
    if (matched.size === 0) {
      canaryFailures.push(`${where}: matched by NO pattern`);
      continue;
    }
    // Each canary names the FAMILY pattern that must catch it, so one wave's
    // claim shape can never be proved by another wave's pattern. Historical
    // rows without the field default to the framework-slim claim shape.
    const mustMatch = canary.mustMatch ?? "bindings-require";
    if (!matched.has(mustMatch)) {
      canaryFailures.push(
        `${where}: not matched by its family pattern "${mustMatch}" ` +
          `(matched ${[...matched].join(", ")}) — that family's pattern regressed`,
      );
      continue;
    }
    console.log(`G7 canary OK  ${where} — matched by ${[...matched].sort().join(", ")}`);
  }
  if (canaryFailures.length > 0) {
    console.error(
      `G7: canary self-test FAILED — the pattern set does not catch the pre-wave claims it ` +
        `exists to kill, so a clean corpus would prove nothing:\n  ${canaryFailures.join("\n  ")}\n` +
        `Fixtures: scripts/g7-canaries.json — every row above is quoted with the commit it was ` +
        `captured at; the waves are ` +
        `${fixture.captureWaves.map((w) => `${w.id}=${w.commit}`).join(", ")}.`,
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
