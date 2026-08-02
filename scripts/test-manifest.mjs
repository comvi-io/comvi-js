import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

/**
 * Wrapper test-manifest gate (framework-slim plan, G2 — "test migration, not deletion").
 *
 * `snapshot` enumerates every test of the six framework bindings with
 * `vitest list --json` and writes the sorted, fully-qualified IDs to
 * scripts/wrapper-test-manifest.json. `check` (also the default command) lists
 * the suites again and fails when a manifest ID no longer exists, unless the
 * manifest's `removals[]` allowlists that exact ID with a rationale.
 *
 * The gate is ID-level on purpose: counts in prose ("91+") are documentation,
 * the manifest is the contract. Renaming or moving a test therefore reads as a
 * removal — migrate the ID or allowlist it with the removed subject.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const MANIFEST_PATH = path.join(SCRIPT_DIR, "wrapper-test-manifest.json");

/** The six framework bindings. All are full migration targets under the parity ruling. */
export const WRAPPER_PACKAGES = [
  { name: "@comvi/react", dir: "packages/react" },
  { name: "@comvi/solid", dir: "packages/solid" },
  { name: "@comvi/svelte", dir: "packages/svelte" },
  { name: "@comvi/vue", dir: "packages/vue" },
  { name: "@comvi/next", dir: "packages/next" },
  { name: "@comvi/nuxt", dir: "packages/nuxt" },
];

export const LIST_COMMAND = "pnpm exec vitest list --json";
export const ID_FORMAT = "<repo-relative test file> > <full test name>";

/** Lists one package's tests as sorted `file > name` IDs, without running them. */
export function listPackageTests(pkgDir, { repoRoot = REPO_ROOT } = {}) {
  const cwd = path.join(repoRoot, pkgDir);
  const stdout = execFileSync("pnpm", ["exec", "vitest", "list", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  let entries;
  try {
    entries = JSON.parse(stdout);
  } catch {
    throw new Error(`${pkgDir}: \`${LIST_COMMAND}\` did not print JSON:\n${stdout.slice(0, 500)}`);
  }

  return entries
    .map((entry) => `${path.relative(repoRoot, entry.file)} > ${entry.name}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Lists every wrapper package. `packages` narrows the run to a subset. */
export function listAllTests(packages = WRAPPER_PACKAGES, options = {}) {
  const current = {};
  for (const pkg of packages) {
    current[pkg.name] = listPackageTests(pkg.dir, options);
  }
  return current;
}

/**
 * Compares a manifest against freshly listed suites. Pure — the caller owns IO.
 *
 * `current` maps package name to its listed IDs; packages absent from it are
 * not checked (targeted per-wrapper runs during a phase).
 */
export function compareManifest({ manifest, current }) {
  const errors = [];
  const perPackage = [];

  const baselineById = new Map();
  for (const pkg of manifest.packages) {
    if (pkg.count !== pkg.tests.length) {
      errors.push(
        `${pkg.name}: manifest count ${pkg.count} does not match its ${pkg.tests.length} listed IDs`,
      );
    }
    for (const id of pkg.tests) baselineById.set(id, pkg.name);
  }

  const allowlisted = new Set();
  for (const [index, removal] of (manifest.removals ?? []).entries()) {
    const where = `removals[${index}]`;
    if (!removal.id || !baselineById.has(removal.id)) {
      errors.push(`${where}: id is not a manifest test ID: ${JSON.stringify(removal.id)}`);
      continue;
    }
    if (typeof removal.reason !== "string" || removal.reason.trim() === "") {
      errors.push(
        `${where}: needs a non-empty \`reason\` naming the removed subject (${removal.id})`,
      );
      continue;
    }
    allowlisted.add(removal.id);
  }

  for (const pkg of manifest.packages) {
    const listed = current[pkg.name];
    if (!listed) continue;

    const live = new Set(listed);
    const missing = pkg.tests.filter((id) => !live.has(id));
    perPackage.push({
      name: pkg.name,
      baseline: pkg.tests.length,
      listed: listed.length,
      missing: missing.filter((id) => !allowlisted.has(id)),
      removed: missing.filter((id) => allowlisted.has(id)),
      stale: pkg.tests.filter((id) => allowlisted.has(id) && live.has(id)),
      added: listed.filter((id) => !baselineById.has(id)).length,
    });
  }

  const ok = errors.length === 0 && perPackage.every((result) => result.missing.length === 0);
  return { ok, errors, packages: perPackage };
}

export function renderComparison({ errors, packages }) {
  const lines = [];
  for (const result of packages) {
    const status = result.missing.length === 0 ? "+" : "x";
    const notes = [`${result.listed} listed`, `${result.baseline} in manifest`];
    if (result.added > 0) notes.push(`+${result.added} new`);
    if (result.removed.length > 0) notes.push(`${result.removed.length} allowlisted removals`);
    lines.push(`${status} ${result.name}: ${notes.join(", ")}`);
    for (const id of result.missing) lines.push(`    MISSING ${id}`);
    for (const id of result.stale)
      lines.push(`    stale allowlist entry (test still exists): ${id}`);
  }
  for (const error of errors) lines.push(`x manifest: ${error}`);
  return lines.join("\n");
}

export function buildManifest({ current, capturedFrom, previous }) {
  return {
    note:
      "Pre-wave test IDs of the six framework bindings, enforced by scripts/test-manifest.mjs (G2 of " +
      ".omc/plans/comvi-framework-slim.md: tests are MIGRATED to the new API, never silently deleted). " +
      `IDs are "${ID_FORMAT}" as reported by \`${LIST_COMMAND}\`. A pre-wave ID that no longer exists ` +
      "fails CI unless removals[] allowlists that exact id with a `reason` naming the removed subject. " +
      "Added tests are always allowed. Counts are derived from the ID lists, never from prose.",
    idFormat: ID_FORMAT,
    listCommand: LIST_COMMAND,
    capturedFrom,
    packages: WRAPPER_PACKAGES.map((pkg) => ({
      name: pkg.name,
      dir: pkg.dir,
      count: current[pkg.name].length,
      tests: current[pkg.name],
    })),
    removals: previous?.removals ?? [],
  };
}

function gitValue(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function resolvePackages(filter) {
  if (!filter) return WRAPPER_PACKAGES;
  const wanted = filter.split(",").map((name) => (name.includes("/") ? name : `@comvi/${name}`));
  const packages = WRAPPER_PACKAGES.filter((pkg) => wanted.includes(pkg.name));
  if (packages.length !== wanted.length) {
    const known = WRAPPER_PACKAGES.map((pkg) => pkg.name).join(", ");
    throw new Error(`--package: unknown wrapper in "${filter}". Known packages: ${known}`);
  }
  return packages;
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Manifest not found: ${manifestPath}. Run \`node scripts/test-manifest.mjs snapshot\`.`,
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith("--") ? args[0] : "check";
  const filterIndex = args.indexOf("--package");
  const filter = filterIndex === -1 ? undefined : args[filterIndex + 1];
  const manifestIndex = args.indexOf("--manifest");
  const manifestPath =
    manifestIndex === -1 ? MANIFEST_PATH : path.resolve(REPO_ROOT, args[manifestIndex + 1]);

  if (command !== "check" && command !== "snapshot") {
    console.error(
      `Unknown command "${command}". Usage: test-manifest.mjs [check|snapshot] [--package <name>] [--manifest <path>]`,
    );
    process.exitCode = 1;
    return;
  }

  const packages = resolvePackages(filter);

  if (command === "snapshot") {
    if (packages.length !== WRAPPER_PACKAGES.length) {
      throw new Error("snapshot captures every wrapper package; drop --package");
    }
    const current = listAllTests(packages);
    const previous = fs.existsSync(manifestPath) ? readManifest(manifestPath) : undefined;
    const manifest = buildManifest({
      current,
      previous,
      capturedFrom: {
        capturedAt: new Date().toISOString().slice(0, 10),
        commit: gitValue(["rev-parse", "HEAD"]),
        branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
        preWaveTag: "framework-slim/pre-wave",
        preWaveCommit: gitValue(["rev-parse", "framework-slim/pre-wave"]),
      },
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const total = manifest.packages.reduce((sum, pkg) => sum + pkg.count, 0);
    console.log(
      `Wrote ${path.relative(REPO_ROOT, manifestPath)}: ${total} test IDs across ${manifest.packages.length} packages`,
    );
    return;
  }

  const manifest = readManifest(manifestPath);
  const comparison = compareManifest({ manifest, current: listAllTests(packages) });
  console.log(renderComparison(comparison));
  if (!comparison.ok) {
    console.error(
      "\nTest manifest gate failed (G2): pre-wave tests must be migrated, not deleted.\n" +
        "Restore the test, or add its exact id to `removals[]` in " +
        `${path.relative(REPO_ROOT, manifestPath)} with a \`reason\` naming the removed subject.`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main();
}
