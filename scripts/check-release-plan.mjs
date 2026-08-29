/**
 * CI guard for the release plan changesets will apply. Three assertions:
 *
 * 0. G7 — no release-facing text carries a stale claim. Runs FIRST and
 *    unconditionally, because a stale CHANGELOG claim is unrecallable once
 *    published, and it self-tests against scripts/g7-canaries.json before it
 *    may pass anything.
 * 1. The planned bump must not exceed the bump the changeset files declare —
 *    a pinned peer range falling out of range silently escalates the whole
 *    fixed group to a major.
 * 2. @comvi/core must be in the plan at the declared bump. It is in the `fixed`
 *    group, so assertion 1 alone would not notice its absence: the other
 *    eleven packages still carry the bump.
 *
 * The target version comes from the branch's own manifest, never from npm.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { declaredMaxBump, nextReleaseVersion, syncPeerRanges } from "./sync-peer-ranges.mjs";

// --- assertion 0: G7 release-facing stale-claim grep -----------------------
//
// Two rules make this a gate rather than a lint:
//   * the canary self-test runs FIRST, and each canary names the family that
//     must catch it, so one claim can never be proved by another's pattern. A
//     pattern set that matches nothing proves nothing;
//   * every allowlist entry names file + line + pattern + reason. Blanket
//     excludes are prohibited: a moved line must be re-reviewed, not inherited.

// The bare root specifier exactly as prose and tables write it. `@comvi/core`
// followed by a `/` is a capability subpath and never the host under discussion,
// so the trailing backtick is load-bearing: it is what keeps `@comvi/core/slim`
// out of THESE patterns (the global `slim-host-subpath` family catches it, and
// its sanctioned mentions are allowlisted by file+line+pattern).
const G7_CORE = "`@comvi/core`";

// A markdown table cell that names the bare root specifier AND a host qualifier,
// in either order. Two lookaheads instead of an order-specific alternation.
const g7QualifiedCell = (qualifiers) =>
  "\\|(?=[^|\\n]*" + G7_CORE + ")(?=[^|\\n]*\\b(?:" + qualifiers + ")\\b)[^|\\n]*";
const g7BaseCell = g7QualifiedCell("bare|base");
const g7RootCell = g7QualifiedCell("root|composed");

// The absence predicate, shared by every alternative of the `root-free` family
// below. `be` covers the modal forms ("must still be absent"), not just the
// indicative ones.
const G7_ABSENT = String.raw`(is|are|be|stays?|remains?|kept)\s+absent`;
// A gap that ends at a SENTENCE period but not at a period inside a word —
// `comvi-core.js`, `createNextI18n.js`, `0.4`. Without that exception a plain
// `[^.]` gap cannot span the base entry's own dist FILE NAME, which is exactly
// how one absence claim escaped every noun-anchored pattern.
const G7_TOKEN_GAP = String.raw`(?:[^.]|\.(?=\w))`;
// The retired-qualifier fence, used by the `stale-ladder` family. A retired name
// introduced AS retired — "absorbed the old `react-on-slim` case" — is the
// successor sentence's own history clause, not a claim that the row still
// exists. The optional backtick is load-bearing: every occurrence in the corpus
// writes the name as a code span, so the character immediately before it is a
// backtick and a fence without it would never fire.
const G7_RETIRED = String.raw`(?<!\b(?:old|former|previous|retired)\s\x60?)`;

const G7_PATTERNS = [
  // The 0.6.0 work folded into 0.5.0; no release text may point at a 0.6.0 target.
  { name: "0.6.0-reference", source: String.raw`0\.6\.0` },
  // The gap is 120 chars because a canary puts 95 characters of package list
  // between "bindings" and "require".
  { name: "bindings-require", source: String.raw`(wrappers?|bindings?).{0,120}require` },
  { name: "full-root", source: String.raw`full root` },
  { name: "requires-root-entry", source: String.raw`require[s]? the root entry` },
  { name: "vanilla-scope", source: String.raw`vanilla[-/ ]` },
  // ── the `root-full` family ──
  // The root entry is the BASE host now. Any release-facing text that still
  // sells it as the batteries-included one, or says it composes capabilities
  // back in, points a reader at semantics that no longer exist. Both patterns
  // are tight on purpose so the deliberate CDN-global exception survives: the
  // README's "serve a batteries-included bundle built from its own entry" puts
  // ~30 characters between the two words, outside the 20-character window.
  {
    name: "root-is-batteries",
    source: String.raw`(batteries[^.\n]{0,20}entr(y|ies)|entr(y|ies)[^.\n]{0,20}batteries)`,
  },
  { name: "root-composes", source: String.raw`root [^.\n]{0,20}entry composes` },
  {
    name: "root-ships-capabilities",
    source: String.raw`root[^.]{0,40}(ships|has|carries)[^.]{0,40}capabilit`,
  },
  { name: "with-on-root-noop", source: String.raw`\.with\([^)]{0,20}\)[^.]{0,30}on\s+an?\s+root` },
  {
    name: "root-behaviour-unchanged",
    source: String.raw`root[^.]{0,20}behavi\w{0,4} is unchanged`,
  },
  {
    name: "root-unchanged-full-icu",
    source: String.raw`root[^.]{0,60}(unchanged|keeps?)[^.]{0,60}(full|ICU)`,
  },
  { name: "root-registers-tags", source: String.raw`root[^.]{0,40}registers? tag` },
  // ── the same-specifier / ambient-tag family ──
  // These are shaped around the SEMANTICS rather than a verb or noun, which is
  // what the patterns above need and what live claims slipped past.
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
  // anything true: there is one `@comvi/core` and it IS the base host. The period
  // bound is what lets the scream changeset state the break across two sentences.
  // The `|` in the prose gap is deliberate: a table row whose two cells are the
  // same specifier with no host qualifier is the TRUE one-entry-per-package shape
  // (the root README's package table), and the table half belongs to
  // `same-specifier-table` below, which demands a qualifier in the cells.
  { name: "same-specifier-hosts", source: G7_CORE + "[^`.|]{0,60}" + G7_CORE },
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
  // ── the `root-free` family ──
  // `createI18n` IS core's base entry, and no wrapper ships a host constructor
  // of its own, so no graph that constructs a host is "root-free". One rule, six
  // spellings: the literal wording, the dist FILE NAME, the entry under its
  // other name put OUT (the noun `entry` is the discriminator — "tree-shakes
  // core out of a `createI18nFromCore`-only app" stays TRUE), and a bare pronoun
  // whose referents sit outside every noun window.
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
  // ── the GLOBAL retired-host-subpath family ──
  // Every `/slim` host tier is retired, so the rule needs no package token to be
  // sound — it is `@comvi/<any>/slim` — and the generalisation is the point: a
  // tier nobody may reintroduce cannot be reintroduced quietly under a package
  // this file never heard of either. Each package keeps only its costume family
  // below, which is a materially different false statement per package.
  //
  // Capability subpaths are the mechanism of extension and are LIVE
  // (`@comvi/core/{icu,loader,plugins,devtools,tags,rich-text}`,
  // `@comvi/next/{client,server,middleware,navigation,routing}`). The `/slim`
  // literal plus the `(?![\w-])` boundary is what keeps them out — the boundary
  // also keeps a hypothetical `/slimmer` out.
  //
  // Sanctioned mentions are pinned ONE PER LINE in G7_ALLOWLIST rather than
  // fenced in prose: a grep target is a reviewed exception, and one entry per
  // file+line+pattern is what stops a SECOND mention hiding behind the first.
  // Anchored on the SPECIFIER, never the bare word `slim` — `pnpm
  // codemod:framework-slim` and the `*-framework-slim.md` /
  // `*-single-package-slim.md` changeset filenames keep that word legitimately
  // alive forever.
  { name: "slim-host-subpath", source: String.raw`@comvi/[a-z][a-z-]*/slim(?![\w-])` },
  // ── the package-scoped COSTUME families, one per wrapper: the two-entry
  //    hazard each package used to have, claimed without naming the specifier ──
  // react — anchored on `distinct`, never the noun, so the TRUE successor ("one
  // entry, so provider and hooks share one React context") passes.
  {
    name: "react-two-contexts",
    source: [
      String.raw`react\s+contexts?[^.\n]{0,30}\bdistinct`,
      String.raw`distinct[^.\n]{0,30}react\s+contexts?`,
    ].join("|"),
  },
  // vue — anchored on `different symbol`, so "`I18N_INJECTION_KEY` is a single
  // symbol" passes.
  {
    name: "vue-two-injection-keys",
    source: [
      String.raw`I18N_INJECTION_KEY[^.\n]{0,40}different symbol`,
      String.raw`different symbol[^.\n]{0,40}I18N_INJECTION_KEY`,
    ].join("|"),
  },
  // solid — anchored on `distinct`, as react's is.
  {
    name: "solid-two-contexts",
    source: [
      String.raw`solid\s+contexts?[^.\n]{0,30}\bdistinct`,
      String.raw`distinct[^.\n]{0,30}\bsolid\s+contexts?`,
    ].join("|"),
  },
  // svelte never had the two-contexts hazard, so its claim was about MIXING the
  // entries being wasteful — a sentence that survives the specifier being
  // stripped out and still points at an import path that no longer exists.
  {
    name: "svelte-two-specifiers",
    source: String.raw`\b(mixing|importing from|import from)\b[^.\n]{0,40}\b(both|the two)\s+(specifiers?|entries|entry)\b`,
  },
  // next's retired host-constructor name. `createSlimI18n` never published, so
  // there is no live use — exactly two mentions are allowlisted by
  // file+line+pattern. Anchored on the identifier, never on the word `slim`.
  { name: "next-slim-host-factory", source: String.raw`\bcreateSlimI18n\b` },
  // ── the GLOBAL stale-ladder family ──
  // A quoted size/matrix row NAME that no longer exists cannot be looked up. One
  // shape covers both dimensions: the size row (`fw-vue-slim-t`) and the
  // bundler-matrix case (`react-on-slim`).
  //
  // `slim` must sit IMMEDIATELY after the enumerated `<half>-` / `on-` segments:
  // a loose gap would match `react-single-package-slim.md`, a changeset filename
  // live prose cites. The `fw-` prefix is optional rather than a second
  // alternative so the leading `(?<![\w-])` boundary applies to the whole name —
  // otherwise one line takes two hits, and the allowlist (keyed on
  // file+line+pattern) deletes its key on the first.
  //
  // Core's retired bare rows are deliberately NOT here: no canary quotes one,
  // and an alternative no canary can prove is the "matches nothing proves
  // nothing" failure. The retired-qualifier lookbehind is the honest boundary —
  // naming a retired row AS retired is the successor's own history clause.
  {
    name: "stale-ladder",
    source:
      G7_RETIRED +
      String.raw`(?<![\w-])(fw-)?(react|solid|svelte|vue|next|nuxt)-(client-|server-)?(on-)?slim[\w-]*`,
  },
].map((p) => ({ ...p, re: new RegExp(p.source, "gis") }));

// Declared family names. Every canary's `mustMatch` and every mutation row's
// `mustNotMatch` / `sanctioned[]` must resolve here: a fixture row pointing at a
// family name that no longer exists would report a regression under the wrong
// rule, or silently label a fence with a family it cannot fence.
const G7_FAMILIES = new Set(G7_PATTERNS.map((p) => p.name));

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
    line: 31,
    pattern: "0.6.0-reference",
    reason:
      "Annotated forward-pointer, not a stale claim: the entry deprecates useClient/useServer/useClientLazy/useServerLazy and names the release that removes them. The framework-slim wave folded into 0.5.0 and does not touch that deprecation window.",
  },
  // `vanilla[-/ ]` exists to catch "slim is for vanilla/direct usage only".
  // These six are the word's other, legitimate job in this repo: an audience
  // label and a permanent docs path. Each is listed individually — a blanket
  // "vanilla is fine" exclude would let the real claim through too.
  {
    file: "README.md",
    line: 51,
    pattern: "vanilla-scope",
    reason:
      'Install-matrix audience label "Vanilla / Node" — names who installs @comvi/core directly, asserts nothing about which hosts the bindings accept.',
  },
  {
    file: "README.md",
    line: 125,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL comvi.io/docs/i18n/vanilla/ — a permanent docs path, not a claim. RE-REVIEWED at single-entry P6 (93 -> 100, the docs link row moved when the one-entry-per-package table landed above it); the line is byte-identical and still a bare docs link. RE-PINNED at 0.5.0-hardening Phase 1 (100 -> 102, the ICU prose above it grew when the production policy changed from a throw to literal + report); the line is byte-identical. RE-PINNED at 0.5.0-hardening Phase 5 (the Quick start gained the platform recipe above it); the line is byte-identical and still a bare docs link.",
  },
  {
    file: "README.md",
    line: 270,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL in the package table's docs column — a permanent docs path, not a claim. RE-REVIEWED at single-entry P6 (181 -> 234, the §Packages table moved down behind the new entry/constructor matrix); the cell is byte-identical. RE-PINNED at 0.5.0-hardening Phase 1 (234 -> 239, the ICU prose above it grew when the production policy changed from a throw to literal + report); the line is byte-identical. RE-PINNED at 0.5.0-hardening Phase 2 (B1) (239 -> 247, the one-entry-per-package section gained the two-ICU-always-hosts note and the rich-text section gained the /tags process-wide scope paragraph); the line is byte-identical. RE-PINNED at 0.5.0-hardening Phase 5 (the Quick start gained the platform recipe above it); the line is byte-identical and still a bare docs link.",
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
    line: 523,
    pattern: "vanilla-scope",
    reason:
      "Documentation URL in the full-API pointer at the end of the README — a permanent docs path, not a claim. RE-REVIEWED at framework-slim tier-3 (383 -> 433, slim section grew), at the framework-slim DX pass (433 -> 464, the single-package section landed), at DX-2 (464 -> 491, the `.with(installer)` section landed), at single-entry P1 (491 -> 474, the two-tier slim section collapsed into the one-entry section, the quickstart gained its ICU note, and the review round added the measured-run pointer), at single-entry P6 (474 -> 507, the capability-subpath and installer sections grew above it), and after final formatting (507 -> 505); the line itself is byte-identical every time and still a bare docs URL. RE-PINNED at 0.5.0-hardening Phase 1 (505 -> 513, the ICU prose above it grew when the production policy changed from a throw to literal + report); the line is byte-identical. Re-pinned again in the same phase (513 -> 516) when the review's fix-first round sharpened the eager/lazy sentence above it; still byte-identical. RE-PINNED at 0.5.0-hardening Phase 2 (B1) (516 -> 523) when the composition blockquote was rewritten off the false loader-before-plugins ordering rule; still byte-identical and still a bare docs URL.",
  },
  // The SIX sanctioned mentions of a retired `/slim` host subpath, one per line,
  // all keyed on the one global `slim-host-subpath` family. Each is a grep
  // target: a reader whose tree was built during 0.5 development holds that
  // specifier and greps for it, so the line that answers them has to contain it.
  // Each says in its own sentence that the specifier is gone and what replaced
  // it, and each sits on its own line, so the pin is unambiguous and a SECOND
  // mention cannot hide behind it.
  {
    file: ".changeset/core-single-entry-convergence.md",
    line: 5,
    pattern: "slim-host-subpath",
    reason:
      "The scream changeset's own deletion history: `@comvi/core/slim` named as the second entry that is deleted, in the sentence that opens the BREAKING notice. Until P6 this mention was let through structurally, by the trailing backtick in G7_CORE, which is not a review — the global family now catches it and this entry is the review. Core's is the one `/slim` specifier whose deletion changed published semantics, so a 0.4 reader has to be able to grep it.",
  },
  {
    file: ".changeset/react-single-entry-convergence.md",
    line: 7,
    pattern: "slim-host-subpath",
    reason:
      "Deletion history, not a live specifier: the grep target for a tree built against 0.5 development, which states in the same sentence that the subpath is retired and that the surviving root is a superset of it. The react convergence is what deleted it; naming it here is the only way a reader holding that import path finds the migration. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  {
    file: ".changeset/vue-single-entry-convergence.md",
    line: 7,
    pattern: "slim-host-subpath",
    reason:
      "Deletion history, not a live specifier: the grep target for a tree built against 0.5 development, which states in the same sentence that the subpath is retired and that the surviving root is a superset of it — `createCore` included, which is the one export a vue reader would otherwise assume left with the subpath. The vue convergence is what deleted it; naming it here is the only way a reader holding that import path finds the migration. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  {
    file: ".changeset/solid-single-entry-convergence.md",
    line: 7,
    pattern: "slim-host-subpath",
    reason:
      "Deletion history, not a live specifier: the grep target for a tree built against 0.5 development, which states in the same sentence that the subpath is retired and that the surviving root is a superset of it. The solid convergence is what deleted it; naming it here is the only way a reader holding that import path finds the migration. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  {
    file: ".changeset/svelte-single-entry-convergence.md",
    line: 7,
    pattern: "slim-host-subpath",
    reason:
      "Deletion history, not a live specifier: the grep target for a tree built against 0.5 development, which states in the same sentence that the subpath is retired and that the surviving root is a superset of it. The svelte convergence is what deleted it; naming it here is the only way a reader holding that import path finds the migration. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  {
    file: "MIGRATION.md",
    line: 159,
    pattern: "slim-host-subpath",
    reason:
      "The codemod's own rename row: `@comvi/core/slim` -> `@comvi/core`. A codemod that rewrites a specifier has to print the specifier it rewrites, or the row documents nothing. P6 split the former single row so that this line carries exactly ONE sanctioned specifier: the wrapper half above it is written `@comvi/<pkg>/slim`, a placeholder no pattern matches, and two hits on one line could not both be pinned. RE-PINNED at 0.5.0-hardening Phase 1 (164 -> 173, the ICU prose above it grew when the production policy changed from a throw to literal + report); the line is byte-identical. Re-pinned again in the same phase (173 -> 175) when the review's fix-first round sharpened the eager/lazy sentence above it; still byte-identical. Re-pinned at 0.5.0-hardening Phase 2 (B1) (175 -> 180): the ICU-timing table cell two rows above widened when the false 'before the loader' ordering rule was replaced, and prettier re-padded the whole table; the row's CONTENT is byte-identical, only column padding changed. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  // Next's retired host-constructor name. TWO sanctioned mentions, not one: a
  // codemod that renames an identifier has to print the identifier it renames.
  {
    file: "MIGRATION.md",
    line: 160,
    pattern: "next-slim-host-factory",
    reason:
      "The codemod's own rename row: `createSlimI18n` -> `createI18n`. The shape the codemod migrates has to be named in the table of shapes it migrates, or the row documents nothing. Deletion history, not a live export. RE-PINNED at 0.5.0-hardening Phase 1 (165 -> 174, the ICU prose above it grew when the production policy changed from a throw to literal + report); the line is byte-identical. Re-pinned again in the same phase (174 -> 176) when the review's fix-first round sharpened the eager/lazy sentence above it; still byte-identical. Re-pinned at 0.5.0-hardening Phase 2 (B1) (176 -> 181): the ICU-timing table cell two rows above widened when the false 'before the loader' ordering rule was replaced, and prettier re-padded the whole table; the row's CONTENT is byte-identical, only column padding changed. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  {
    file: ".changeset/next-single-entry-convergence.md",
    line: 7,
    pattern: "next-slim-host-factory",
    reason:
      "The one sanctioned grep target, exactly as `react-single-entry-convergence.md:11` names react's retired subpath: a reader whose tree was built against 0.5 development greps for the identifier they hold, and the line that answers them states in the same sentence that it is deleted, never published, and codemod-renamed. Its own line, so a second mention cannot hide behind it. RE-PINNED at 0.5.0-hardening Phase 5, when the release-facing prose was rewritten for a 0.4.x upgrader (MIGRATION.md 64.5 -> 33.5 KB, the changesets 195 -> 92 KB): the sanctioned sentence is still the only occurrence on its line and still says the specifier is gone and what replaced it.",
  },
  // The `stale-ladder` family needs NO allowlist entry: every retired row and
  // matrix-case name still quoted in the corpus is introduced as retired, which
  // the family's retired-qualifier fence lets through.
];

function runG7() {
  // (a) Canary self-test — the gate may not pass anything until it proves the
  //     pattern set catches the exact claims it exists to kill.
  const fixture = JSON.parse(fs.readFileSync("scripts/g7-canaries.json", "utf8"));
  const waves = new Map(fixture.captureWaves.map((w) => [w.id, w]));
  const canaryFailures = [];
  for (const canary of fixture.canaries) {
    // Provenance is part of the fixture's contract: the rows were captured at
    // different commits, so a row that cannot resolve its own capture point
    // would be reported under someone else's tree. Fail rather than guess.
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
    // Each canary names the FAMILY pattern that must catch it, so one claim
    // shape can never be proved by another family's pattern.
    const mustMatch = canary.mustMatch ?? "bindings-require";
    if (!G7_FAMILIES.has(mustMatch)) {
      canaryFailures.push(
        `${where}: names family "${mustMatch}", which is not a declared pattern — a row whose ` +
          `family was renamed out from under it proves nothing`,
      );
      continue;
    }
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

  // (a2) Mutation self-test — the NEGATIVE half. Every row is a claim that is
  //      still TRUE, so no pattern may fire: an over-broad pattern forces an
  //      allowlist entry onto correct prose, and the next real regression on
  //      that line is then inherited as "already allowlisted" instead of
  //      reviewed.
  //
  //      ONE exception, declared per row in `sanctioned[]`: a family designed to
  //      fire on EVERY occurrence (`slim-host-subpath`) must fire on a sentence
  //      that is a sanctioned grep target. Such a row asserts in BOTH
  //      directions, so a `sanctioned` family gone quiet is a stale sanction.
  const mutationFailures = [];
  for (const mutation of fixture.mutations) {
    const sanctioned = mutation.sanctioned ?? [];
    const undeclared = [mutation.mustNotMatch, ...sanctioned].filter(
      (name) => !G7_FAMILIES.has(name),
    );
    if (undeclared.length > 0) {
      mutationFailures.push(
        `${mutation.of}: names undeclared pattern(s) ${undeclared.join(", ")} — a fence pointed ` +
          `at a family that no longer exists reports nothing`,
      );
      continue;
    }
    const fired = [...new Set(g7Scan(mutation.text).map((h) => h.pattern))].sort();
    const overBroad = fired.filter((name) => !sanctioned.includes(name));
    const missing = sanctioned.filter((name) => !fired.includes(name));
    if (overBroad.length === 0 && missing.length === 0) {
      const note =
        sanctioned.length > 0
          ? `sanctioned ${sanctioned.join(", ")} fired as designed (${mutation.sanctionedBy})`
          : `silent, fencing "${mutation.mustNotMatch}"`;
      console.log(`G7 mutation OK  ${mutation.of} — ${note}`);
      continue;
    }
    if (overBroad.length > 0) {
      mutationFailures.push(
        `${mutation.of}: fired ${overBroad.join(", ")} on a TRUE claim ` +
          `(fencing "${mutation.mustNotMatch}") — ${mutation.why}`,
      );
    }
    if (missing.length > 0) {
      mutationFailures.push(
        `${mutation.of}: sanctioned family ${missing.join(", ")} did NOT fire, so the ` +
          `allowlist entry it stands for (${mutation.sanctionedBy}) is a stale hole`,
      );
    }
  }
  if (mutationFailures.length > 0) {
    console.error(
      `G7: mutation self-test FAILED — a pattern matches prose that is CORRECT, so the gate ` +
        `would demand an allowlist entry for text nobody should have to defend:\n  ` +
        `${mutationFailures.join("\n  ")}\n` +
        `Fixtures: scripts/g7-canaries.json (mutations). Narrow the pattern; do not allowlist ` +
        `the corpus around it.`,
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
      `pattern(s), proved by ${fixture.canaries.length} canary and ` +
      `${fixture.mutations.length} mutation fixture(s), ` +
      `${G7_ALLOWLIST.length} annotated allowlist entr(ies).`,
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

// --- assertion 2: the specific @comvi/core entry ---
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
