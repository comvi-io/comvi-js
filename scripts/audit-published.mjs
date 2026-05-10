#!/usr/bin/env node
/**
 * Run `pnpm audit --prod --audit-level=high` and exit non-zero ONLY if
 * vulnerabilities affect a published @comvi/* package.
 *
 * Vulnerabilities reachable only through test-apps/* are treated as
 * dev-only noise and ignored — those packages are private (per
 * .changeset/config.json `ignore` list) and never reach end users.
 *
 * Usage:
 *   node scripts/audit-published.mjs
 *
 * Exit codes:
 *   0 — no vulnerabilities in published packages
 *   1 — at least one vulnerability in a published package
 *   2 — script error (audit could not run / parse)
 */
import { execSync } from "node:child_process";

function run() {
  try {
    return execSync("pnpm audit --prod --audit-level=high --json", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (e) {
    // pnpm audit exits non-zero when vulnerabilities are found — that's expected.
    // We deliberately ignore e.stderr here: pnpm v9+ always writes the
    // `--json` body to stdout, and stderr only carries DeprecationWarning
    // lines that would corrupt JSON.parse if concatenated.
    return e.stdout || "";
  }
}

const raw = run();
// Some pnpm/Node combos emit DeprecationWarning lines before the JSON body.
const start = raw.indexOf("{");
if (start < 0) {
  console.error("audit-published: could not find JSON in pnpm audit output");
  console.error(raw);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(raw.slice(start));
} catch (err) {
  console.error("audit-published: failed to parse pnpm audit JSON:", err.message);
  process.exit(2);
}

const TEST_APP_PREFIX = "test-apps__";

// Fail closed on schema drift — silently defaulting `actions` to [] would
// produce a green audit gate when pnpm changes its JSON shape.
if (!Array.isArray(data.actions)) {
  console.error(
    "audit-published: unexpected pnpm audit JSON schema (missing `actions` array)",
  );
  process.exit(2);
}
const actions = data.actions;

// Keep only resolves that touch a path NOT rooted in test-apps__*
const publishedActions = actions
  .map((a) => ({
    module: a.module,
    target: a.target,
    resolves: (a.resolves || []).filter((r) => {
      const path = r.path || "";
      return !path.startsWith(TEST_APP_PREFIX);
    }),
  }))
  .filter((a) => a.resolves.length > 0);

if (publishedActions.length === 0) {
  console.log(
    "audit-published: no vulnerabilities in published packages (test-app paths ignored as dev-only).",
  );
  process.exit(0);
}

console.error("audit-published: vulnerabilities found in PUBLISHED packages:\n");
for (const a of publishedActions) {
  console.error(`  - ${a.module} -> ${a.target ?? "?"}`);
  for (const r of a.resolves) {
    console.error(`      path: ${r.path}`);
  }
}
console.error(
  `\nTotal: ${publishedActions.length} actionable vulnerabilities. Run \`pnpm audit --prod --audit-level=high\` for full details.`,
);
process.exit(1);
