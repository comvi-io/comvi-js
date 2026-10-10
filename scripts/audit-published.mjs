#!/usr/bin/env node
/**
 * Run `pnpm audit --prod --json` and exit non-zero ONLY if a vulnerability at
 * or above the requested severity reaches a *published* artifact — anything a
 * user actually installs or downloads, not this repo's own dev/test tooling.
 *
 * "Published" is decided by the FIRST path segment (the workspace root pnpm
 * emits, e.g. `packages__plugin-in-context-editor`) alone: `test-apps/*`,
 * `tooling/*` and `examples/*` are dev-only fixtures and sample code that
 * never ship, so their roots are excluded. Everything else — `packages/*`
 * (published npm packages) AND `apps/*` (e.g. the Chrome extension, shipped
 * to the Chrome Web Store rather than npm) — is published-relevant. This is
 * deliberately NOT narrowed by a package's own `private` field or by whether
 * a dependency is listed under `dependencies` vs `devDependencies`: this
 * repo's build tooling bundles across both without preserving that split —
 * `@comvi/plugin-in-context-editor`'s `./standalone` entry is built with
 * `external: []`, so it inlines devDependencies (vue, reka-ui, …) into a
 * published artifact, and the two `private: true` packages under `packages/*`
 * (`@comvi/typegen`, `@comvi/locale-routing`) are themselves inlined into
 * twelve OTHER published packages. Package-manifest metadata cannot tell you
 * what a bundler actually inlined, so every `packages/*` and `apps/*` path is
 * in scope, full stop. An UNRECOGNIZED workspace root (a future top-level
 * directory, or pnpm reshaping the JSON) fails CLOSED: it is reported, not
 * silently dropped.
 *
 * The root check normalizes across the two path-string conventions this same
 * `pnpm audit --json` output uses for what is otherwise the same dependency
 * chain: `actions[].resolves[].path` joins segments with ">" and spells the
 * workspace root with "__" for its folder separator
 * (`test-apps__nuxt>nuxt>ws`), while `advisories[<id>].findings[].paths`
 * joins with " > " and spells it with "/" (`test-apps/nuxt > nuxt@… > ws@…`).
 * `workspaceRootWord()` strips at whichever of "__", ">" or "/" comes first,
 * so both spellings of the same root resolve to the same word.
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

export const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];
export const DEFAULT_SEVERITY = "high";

/** Workspace roots that are dev-only fixtures/samples and never ship. */
export const PRIVATE_ROOT_WORDS = new Set(["test-apps", "tooling", "examples"]);

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
 * The first path segment (the workspace root) of a pnpm-audit dependency
 * chain, independent of which of the two separator conventions this
 * particular string uses — see the module doc comment. Only the first
 * segment is normalized: everything after it is an ordinary npm package name
 * (which may itself legitimately contain "/", e.g. `@nuxt/devtools`) and is
 * never re-split.
 */
export function workspaceRootWord(auditPath) {
  const raw = String(auditPath);
  const candidates = [raw.indexOf("__"), raw.indexOf(">"), raw.indexOf("/")].filter(
    (i) => i !== -1,
  );
  const stop = candidates.length > 0 ? Math.min(...candidates) : raw.length;
  return raw.slice(0, stop);
}

/**
 * A path is published-relevant unless it is rooted in a known dev-only
 * workspace area. Fails CLOSED on anything it does not recognize.
 */
export function isPublishedPath(auditPath) {
  return !PRIVATE_ROOT_WORDS.has(workspaceRootWord(auditPath));
}

/**
 * Filter raw `pnpm audit --json` output down to actions that resolve through
 * a published path at/above `severity`. Fails closed (throws) on schema
 * drift — silently defaulting `actions` to `[]` would produce a green gate
 * when pnpm changes its JSON shape.
 */
export function classifyActions(data, { severity = DEFAULT_SEVERITY } = {}) {
  if (!Array.isArray(data?.actions)) {
    throw new Error("unexpected pnpm audit JSON schema (missing `actions` array)");
  }
  const advisories = data.advisories || {};

  return data.actions
    .map((a) => ({
      module: a.module,
      target: a.target,
      resolves: (a.resolves || []).filter((r) => {
        if (!isPublishedPath(r.path || "")) return false;
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

  let publishedActions;
  try {
    publishedActions = classifyActions(data, { severity });
  } catch (err) {
    console.error(`audit-published: ${err.message}`);
    process.exit(2);
  }

  if (publishedActions.length === 0) {
    console.log(
      `audit-published: no vulnerabilities at/above "${severity}" in published packages ` +
        "(test-apps/tooling/examples paths ignored as dev-only).",
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
