#!/usr/bin/env node
/**
 * Run `pnpm audit --prod --json` and exit non-zero ONLY if a vulnerability at
 * or above the requested severity reaches a *published* @comvi/* package
 * through one of ITS runtime dependencies.
 *
 * "Published" means: rooted in a `packages/*` workspace member whose
 * package.json does not declare `private: true`, reached through a name
 * listed in that package's `dependencies` (not `devDependencies` — a path
 * that only dips into the package through its own build/test tooling never
 * ships). Every other workspace member — `test-apps/*`, `tooling/*`,
 * `apps/*`, and any `private: true` package under `packages/*` (e.g.
 * `@comvi/typegen`, `@comvi/locale-routing`) — is dev-only noise and ignored.
 *
 * Usage:
 *   node scripts/audit-published.mjs [--severity <info|low|moderate|high|critical>]
 *
 * Exit codes:
 *   0 — no vulnerabilities at/above the threshold in published packages
 *   1 — at least one such vulnerability
 *   2 — script error (audit could not run / parse)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];
export const DEFAULT_SEVERITY = "high";

/** `sev` meets or exceeds `threshold`; an unrecognized severity fails open (kept, not dropped). */
export function severityAtLeast(severity, threshold) {
  const s = SEVERITY_ORDER.indexOf(severity);
  const t = SEVERITY_ORDER.indexOf(threshold);
  if (s === -1 || t === -1) return true;
  return s >= t;
}

export function parseSeverityArg(argv, fallback = DEFAULT_SEVERITY) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--severity") return argv[i + 1] ?? fallback;
    if (arg.startsWith("--severity=")) return arg.slice("--severity=".length);
  }
  return fallback;
}

/**
 * Publishable workspace packages, keyed by the pnpm-audit path prefix pnpm
 * emits for that workspace importer (`packages/<dir>` -> `packages__<dir>`,
 * `/` replaced with `__`, matching the `>`-joined dependency-chain format).
 * Each value is the set of that package's runtime `dependencies` names.
 */
export function loadPublishablePackages(repoRoot = REPO_ROOT) {
  const packagesDir = path.join(repoRoot, "packages");
  const publishable = new Map();
  let entries;
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return publishable;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = path.join(packagesDir, entry.name, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    } catch {
      continue;
    }
    if (pkg.private === true) continue;

    const prefix = `packages__${entry.name}`;
    publishable.set(prefix, new Set(Object.keys(pkg.dependencies || {})));
  }

  return publishable;
}

/**
 * A pnpm audit `resolves[].path` is a *published* path when its root segment
 * names a publishable workspace package and — if the chain goes deeper — the
 * very next segment is one of that package's runtime `dependencies`. Once
 * inside a real runtime dependency, everything nested beneath it is whatever
 * npm/pnpm actually installed for it; only the package's OWN top-level
 * dependencies-vs-devDependencies split matters.
 */
export function isPublishedPath(auditPath, publishablePackages) {
  const segments = String(auditPath).split(">");
  const root = segments[0];
  const runtimeDeps = publishablePackages.get(root);
  if (!runtimeDeps) return false;
  if (segments.length === 1) return true;
  return runtimeDeps.has(segments[1]);
}

/**
 * Filter raw `pnpm audit --json` output down to actions that resolve through
 * a published path at/above `severity`. Fails closed (throws) on schema
 * drift — silently defaulting `actions` to `[]` would produce a green gate
 * when pnpm changes its JSON shape.
 */
export function classifyActions(data, { publishablePackages, severity = DEFAULT_SEVERITY }) {
  if (!Array.isArray(data?.actions)) {
    throw new Error("unexpected pnpm audit JSON schema (missing `actions` array)");
  }
  const advisories = data.advisories || {};

  return data.actions
    .map((a) => ({
      module: a.module,
      target: a.target,
      resolves: (a.resolves || []).filter((r) => {
        if (!isPublishedPath(r.path || "", publishablePackages)) return false;
        const advisorySeverity = advisories[String(r.id)]?.severity;
        return advisorySeverity ? severityAtLeast(advisorySeverity, severity) : true;
      }),
    }))
    .filter((a) => a.resolves.length > 0);
}

function run() {
  try {
    return execSync("pnpm audit --prod --json", {
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

function main() {
  const severity = parseSeverityArg(process.argv.slice(2));
  if (!SEVERITY_ORDER.includes(severity)) {
    console.error(
      `audit-published: unknown --severity "${severity}" (expected one of ${SEVERITY_ORDER.join(", ")})`,
    );
    process.exit(2);
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

  const publishablePackages = loadPublishablePackages();

  let publishedActions;
  try {
    publishedActions = classifyActions(data, { publishablePackages, severity });
  } catch (err) {
    console.error(`audit-published: ${err.message}`);
    process.exit(2);
  }

  if (publishedActions.length === 0) {
    console.log(
      `audit-published: no vulnerabilities at/above "${severity}" in published packages ` +
        "(private workspace packages ignored as dev-only).",
    );
    process.exit(0);
  }

  console.error(`audit-published: vulnerabilities found in PUBLISHED packages (>= ${severity}):\n`);
  for (const a of publishedActions) {
    console.error(`  - ${a.module} -> ${a.target ?? "?"}`);
    for (const r of a.resolves) {
      console.error(`      path: ${r.path}`);
    }
  }
  console.error(
    `\nTotal: ${publishedActions.length} actionable vulnerabilities. Run \`pnpm audit --prod\` for full details.`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
