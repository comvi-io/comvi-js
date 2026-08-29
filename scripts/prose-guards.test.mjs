// Prose guard for the ONE true composition-ordering rule (0.5.0 hardening, B1).
//
// Runtime probes proved the 0.5 corpus wrong on two counts: `loader()`,
// `plugins()` and `devtools()` may be composed in ANY order among themselves
// (hosted plugins run at `init()`, by which point every capability composed
// before `init()` is attached), and `.with(icu())` does not have to precede a
// LOADER — composing a loader ingests nothing. The single rule that survives:
//
//   `icu()` must run before the first catalog reaches the host (constructor
//   `translation`, `addTranslations`, or a loader merge); the order of
//   `loader()`, `plugins()` and `devtools()` among themselves is free.
//
// This gate keeps the retired phrasings out of every surface a reader — or the
// next copy-paste — starts from: the root README, the migration guide, package
// READMEs, the changesets (which ARE the published changelog) and package
// sources INCLUDING their comments.
//
// Two rules make it a gate rather than a lint, borrowed from G7
// (scripts/check-release-plan.mjs): the canary self-test runs first, so a
// pattern set that matches nothing cannot pass; and the only escape is an
// explicit inline `prose-guards: allow` marker on the offending line, never a
// file-level or pattern-level exclude — a moved line must be re-reviewed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A line carrying this marker is reviewed prose, not a stale claim. */
const ALLOW_MARKER = "prose-guards: allow";

/**
 * The retired phrasings. Each `re` is matched against ONE line, so every
 * pattern is written to fit on the line a writer would actually type it on.
 */
const RETIRED_PATTERNS = [
  {
    id: "loader-before-plugins",
    re: /`?loader\(\)`?\s+before\b/i,
    rule: "the order of loader()/plugins()/devtools() among themselves is free",
  },
  {
    id: "before-plugins-host",
    re: /\bbefore\s+(?:`?plugins\(\)|the\s+plugin\s+host\b)/i,
    rule: "the order of loader()/plugins()/devtools() among themselves is free",
  },
  {
    id: "capability-order-rank",
    re: /`?(?:loader|plugins|devtools)\(\)`?\s+(?:goes\s+on\s+)?(?:first|last)\b/i,
    rule: "no capability installer goes first or last; their order is free",
  },
  {
    id: "icu-before-loader",
    re: /\bbefore\s+(?:the\s+|a\s+|any\s+)?loaders?\b/i,
    rule: "icu() must precede the first CATALOG, not the loader — composing a loader ingests nothing",
  },
  {
    id: "in-that-order-because",
    re: /\bin\s+that\s+order,\s*because\b/i,
    rule: "the installers attach in an order, but no order is required",
  },
];

/**
 * Verbatim claims from the pre-B1 tree, each naming the family that must catch
 * it. Multi-line entries are the soft-wrapped ones: prose and block comments
 * wrap mid-sentence, so the scanner has to see across one line break or the
 * writer's line width decides whether the gate fires.
 */
const CANARIES = [
  {
    caughtBy: "loader-before-plugins",
    text: "`loader()` before `plugins()` when a plugin registers a loader — plugins run at",
  },
  {
    caughtBy: "before-plugins-host",
    text: "// Compose `loader()` BEFORE `plugins()` when any hosted plugin registers a",
  },
  {
    caughtBy: "before-plugins-host",
    text: "// Compose BEFORE the plugin host when a hosted plugin registers a loader",
  },
  {
    caughtBy: "capability-order-rank",
    text: "you register plugins from a list. `loader()` goes on first when a plugin",
  },
  {
    caughtBy: "capability-order-rank",
    text: " * plugins-only host — compose `loader()` first.** Both builds still throw; only",
  },
  {
    caughtBy: "capability-order-rank",
    text: "Compose `loader()` and `plugins()` before\ncatalog ingestion and `devtools()` last. Inline / constructor catalogs select",
  },
  {
    caughtBy: "icu-before-loader",
    text: "inline: `compiler: icuCompiler`; remote: `.with(icu())` before the loader",
  },
  {
    caughtBy: "icu-before-loader",
    text: "// and it must run BEFORE the loader can ingest anything — the host locks its",
  },
  {
    caughtBy: "icu-before-loader",
    text: "remote catalogs: `.with(icu())` on the core, BEFORE the loader |",
  },
  {
    caughtBy: "icu-before-loader",
    text: "  `.with(icu())` before\n  the loader yourself. Nothing textual proves what a CDN",
  },
  {
    caughtBy: "in-that-order-because",
    text: " * Composes `@comvi/core/loader` and `@comvi/core/plugins` — in that order,\n * because the plugin calls `registerLoader` at `init()` — and then registers",
  },
];

/**
 * Prose that is TRUE and must stay silent. The `icu-before-loader` family
 * generalises over any "before the loader", so it is only sound if it leaves
 * the sentences that talk about ingestion timing, or about `init()`, alone.
 * Wrapped entries additionally prove the two-line window does not manufacture
 * a claim by gluing two innocent lines together.
 */
const MUTATIONS = [
  "`.with(icu())` must run before the first catalog reaches the host.",
  "The compiler locks on the first catalog — a constructor `translation`, an `addTranslations` call, or a loader merge.",
  "Every capability is composed before `init()`; their order among themselves is free.",
  "`.with(loader())` ran after init(): compose capabilities before init().",
  "an actionable message, before either capability is attached",
  "discovery, in that order.",
  "the plugin host, nested constructor catalogs, default params and devtools\ndiscovery, in that order.",
  "compose it before\n`init()`. The loader merges catalogs as they arrive.",
];

/** Strip a line's comment lead-in so a soft wrap reads as one sentence. */
function unwrap(line) {
  return line.replace(/^\s*(?:\/\/|\*)\s?/, "").trim();
}

/**
 * Scan lines for retired phrasings. Each line is tested on its own AND joined
 * with the one after it, so a claim cannot escape by wrapping. A hit is
 * reported once per (line, pattern), against the line the claim STARTS on.
 */
function scanLines(lines, file = "<fixture>") {
  const hits = [];
  const seen = new Set();
  lines.forEach((line, index) => {
    const next = lines[index + 1] ?? "";
    if (line.includes(ALLOW_MARKER) || next.includes(ALLOW_MARKER)) return;
    const here = unwrap(line);
    const joined = `${here} ${unwrap(next)}`;
    for (const pattern of RETIRED_PATTERNS) {
      // Report a wrapped claim ONCE, on the line it starts on: the joined
      // window only counts when the claim is genuinely split, otherwise the
      // line that carries it whole reports it on its own turn.
      const split = pattern.re.test(joined) && !pattern.re.test(unwrap(next));
      if (!pattern.re.test(here) && !split) continue;
      const key = `${index + 1}:${pattern.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        file,
        line: index + 1,
        pattern: pattern.id,
        rule: pattern.rule,
        text: line.trim(),
      });
    }
  });
  return hits;
}

/**
 * The corpus: every surface a 0.5 reader lands on, plus package sources —
 * a source comment is where the next copy-paste starts, so it is in scope
 * exactly like the published prose is.
 */
function listFiles() {
  const files = [];
  const add = (rel) => {
    if (fs.existsSync(path.join(ROOT, rel))) files.push(rel);
  };
  add("README.md");
  add("MIGRATION.md");

  for (const entry of fs.readdirSync(path.join(ROOT, ".changeset")).sort()) {
    if (entry.endsWith(".md")) files.push(path.join(".changeset", entry));
  }

  const packagesDir = path.join(ROOT, "packages");
  for (const pkg of fs.readdirSync(packagesDir).sort()) {
    if (!fs.statSync(path.join(packagesDir, pkg)).isDirectory()) continue;
    add(path.join("packages", pkg, "README.md"));

    const srcDir = path.join(packagesDir, pkg, "src");
    if (!fs.existsSync(srcDir)) continue;
    const walk = (dir) => {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts")) files.push(path.relative(ROOT, full));
      }
    };
    walk(srcDir);
  }
  return files;
}

/** Every retired-phrase hit in the corpus, minus the explicitly allowed lines. */
export function scanCorpus() {
  return listFiles().flatMap((file) =>
    scanLines(fs.readFileSync(path.join(ROOT, file), "utf8").split("\n"), file),
  );
}

test("the pattern set fires on every retired phrasing it claims to retire", () => {
  for (const canary of CANARIES) {
    const fired = scanLines(canary.text.split("\n")).map((hit) => hit.pattern);
    assert.ok(
      fired.includes(canary.caughtBy),
      `canary escaped its family "${canary.caughtBy}" (fired: ${fired.join(", ") || "none"}):\n  ${canary.text}`,
    );
  }
});

test("no pattern fires on prose that is still true", () => {
  for (const text of MUTATIONS) {
    const fired = scanLines(text.split("\n")).map((hit) => hit.pattern);
    assert.deepEqual(
      fired,
      [],
      `pattern(s) ${fired.join(", ")} would demand an allow marker on correct prose:\n  ${text}\n` +
        `Narrow the pattern; do not mark true prose as allowed.`,
    );
  }
});

test("the allow marker is honoured, and only on the line that carries it", () => {
  const line = "| `.with(icu())` after a loader | moved before the loader |";
  assert.deepEqual(
    scanLines([line]).map((hit) => hit.pattern),
    ["icu-before-loader"],
  );
  assert.deepEqual(scanLines([`${line} <!-- ${ALLOW_MARKER} -->`]), []);
});

test("release-facing prose carries no retired ordering rule", () => {
  const hits = scanCorpus();
  const report = hits
    .map(
      (hit) =>
        `  ${hit.file}:${hit.line}  [${hit.pattern}]\n    ${hit.text}\n    rule: ${hit.rule}`,
    )
    .join("\n");
  assert.equal(
    hits.length,
    0,
    `${hits.length} retired ordering claim(s) in release-facing prose:\n${report}\n\n` +
      `The one true rule: \`icu()\` must run before the first catalog reaches the host\n` +
      `(constructor \`translation\`, \`addTranslations\`, or a loader merge); the order of\n` +
      `\`loader()\`, \`plugins()\` and \`devtools()\` among themselves is free.\n` +
      `Fix the text, or add an inline \`${ALLOW_MARKER}\` marker on the line with a reason beside it.`,
  );
});
