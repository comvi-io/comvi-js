import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

/**
 * Wrapper test-manifest gate: test migration, not deletion.
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
 *
 * The baseline is never re-taken: doing so would erase the guarantee it exists
 * to provide. That leaves one hole — a test ADDED and then deleted between two
 * baselines is invisible to a baseline-only gate — so the manifest carries a
 * RENAME MAP beside the baseline, in two granularities, every row of which is
 * checked against the live listing rather than taken on trust:
 *
 *   * `renames[]` is FILE level — `{ fromFile, toFile, minIds, reason }`. The
 *     source file must list ZERO tests (or the rename did not happen) and the
 *     target must still list at least the `minIds` audited when the row landed
 *     (or the file lost tests rather than moving them).
 *   * `removals[]` is ID level. A baseline id behaves as it always has. A
 *     post-baseline id needs `addedIn` naming what added it — which is what
 *     stops a typo masquerading as a baseline row — and must genuinely be
 *     gone. Either kind may name `supersededBy`, the LIVE id that carries the
 *     retired claim, which is how an id-level rename is recorded: the gate fails
 *     if that successor does not exist, so "migrated" is never a bare assertion.
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

/** The package a repo-relative test ID (or file path) belongs to, by `dir` prefix. */
function packageOf(manifest, idOrFile) {
  const file = String(idOrFile ?? "").split(" > ")[0];
  const owner = manifest.packages.find((pkg) => file.startsWith(`${pkg.dir}/`));
  return owner?.name;
}

/**
 * Compares a manifest against freshly listed suites. Pure — the caller owns IO.
 *
 * `current` maps package name to its listed IDs; packages absent from it are
 * not checked (targeted per-wrapper runs). Every rename-map row
 * is checked against the same listing, and a row whose package is not in this
 * run is skipped rather than guessed at.
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

  // A package in this run, as `{ ids, live, byFile }`; `undefined` means "not
  // listed in this run", which is the one case where a row is left unchecked.
  const listings = new Map();
  for (const pkg of manifest.packages) {
    const listed = current[pkg.name];
    if (!listed) continue;
    const byFile = new Map();
    for (const id of listed) {
      const file = id.split(" > ")[0];
      byFile.set(file, (byFile.get(file) ?? 0) + 1);
    }
    listings.set(pkg.name, { ids: listed, live: new Set(listed), byFile });
  }
  const listingFor = (idOrFile) => listings.get(packageOf(manifest, idOrFile));

  const allowlisted = new Set();
  const postBaseline = new Set();
  for (const [index, removal] of (manifest.removals ?? []).entries()) {
    const where = `removals[${index}]`;
    if (typeof removal.id !== "string" || removal.id.trim() === "") {
      errors.push(`${where}: needs an \`id\`: ${JSON.stringify(removal.id)}`);
      continue;
    }
    if (typeof removal.reason !== "string" || removal.reason.trim() === "") {
      errors.push(
        `${where}: needs a non-empty \`reason\` naming the removed subject (${removal.id})`,
      );
      continue;
    }
    const isBaseline = baselineById.has(removal.id);
    const hasAddedIn = typeof removal.addedIn === "string" && removal.addedIn.trim() !== "";
    if (isBaseline && hasAddedIn) {
      errors.push(
        `${where}: id IS a baseline test ID, so \`addedIn\` contradicts it — drop the field (${removal.id})`,
      );
      continue;
    }
    if (!isBaseline) {
      // Not in the baseline: added and retired between two baselines. The gate
      // cannot check that it ever existed, so the row must SAY what added it —
      // otherwise a mistyped baseline id would pass as one of these.
      if (!hasAddedIn) {
        errors.push(
          `${where}: id is not a baseline test ID, so it needs \`addedIn\` naming the wave that ` +
            `added it (a post-baseline retirement), or the id is wrong: ${JSON.stringify(removal.id)}`,
        );
        continue;
      }
      const owner = packageOf(manifest, removal.id);
      if (!owner) {
        errors.push(
          `${where}: id names no manifest package directory: ${JSON.stringify(removal.id)}`,
        );
        continue;
      }
      const listing = listingFor(removal.id);
      if (listing?.live.has(removal.id)) {
        errors.push(`${where}: recorded as retired, but the test is still listed: ${removal.id}`);
        continue;
      }
      postBaseline.add(removal.id);
    }
    if (removal.supersededBy !== undefined) {
      // The successor is the whole point of a rename row: it is what turns
      // "deleted" into "migrated", so it may never be a bare assertion.
      const successor = removal.supersededBy;
      const listing = listingFor(successor);
      if (typeof successor !== "string" || !packageOf(manifest, successor)) {
        errors.push(`${where}: \`supersededBy\` is not a test ID: ${JSON.stringify(successor)}`);
        continue;
      }
      if (listing && !listing.live.has(successor)) {
        errors.push(
          `${where}: \`supersededBy\` names no listed test, so the claim it carries was dropped ` +
            `rather than migrated: ${successor}`,
        );
        continue;
      }
    }
    allowlisted.add(removal.id);
  }

  const renamedFiles = [];
  for (const [index, rename] of (manifest.renames ?? []).entries()) {
    const where = `renames[${index}]`;
    const { fromFile, toFile, minIds, reason } = rename;
    const owner = packageOf(manifest, toFile);
    if (typeof fromFile !== "string" || typeof toFile !== "string" || !owner) {
      errors.push(
        `${where}: needs \`fromFile\` and \`toFile\` repo-relative paths inside a manifest package: ` +
          `${JSON.stringify(fromFile)} -> ${JSON.stringify(toFile)}`,
      );
      continue;
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      errors.push(`${where}: needs a non-empty \`reason\` (${fromFile} -> ${toFile})`);
      continue;
    }
    // `minIds` is the floor the target was audited at, not a claim about how many
    // tests the file has: additions are always allowed, so the row can only ever
    // say "at least this many were here when the rename was reviewed". That makes
    // the renamed file a no-shrink contract, which is the half of "migrated, not
    // deleted" a file-level row can actually prove.
    if (!Number.isInteger(minIds) || minIds < 1) {
      errors.push(
        `${where}: needs \`minIds\` >= 1, the number of tests the target listed when the rename ` +
          `was audited (${fromFile} -> ${toFile})`,
      );
      continue;
    }
    const listing = listings.get(owner);
    if (!listing) continue;
    if ((listing.byFile.get(fromFile) ?? 0) > 0) {
      errors.push(
        `${where}: \`fromFile\` still lists tests, so the rename did not happen: ${fromFile}`,
      );
      continue;
    }
    const landed = listing.byFile.get(toFile) ?? 0;
    if (landed < minIds) {
      errors.push(
        `${where}: \`toFile\` lists ${landed} test(s), below the ${minIds} audited at the rename, ` +
          `so the file lost tests rather than moving them: ${toFile}`,
      );
      continue;
    }
    renamedFiles.push(toFile);
  }

  for (const pkg of manifest.packages) {
    const listing = listings.get(pkg.name);
    if (!listing) continue;

    const { ids, live } = listing;
    const missing = pkg.tests.filter((id) => !live.has(id));
    perPackage.push({
      name: pkg.name,
      baseline: pkg.tests.length,
      listed: ids.length,
      missing: missing.filter((id) => !allowlisted.has(id)),
      removed: missing.filter((id) => allowlisted.has(id)),
      retired: [...postBaseline].filter((id) => packageOf(manifest, id) === pkg.name).length,
      renamedFiles: renamedFiles.filter((file) => packageOf(manifest, file) === pkg.name).length,
      stale: pkg.tests.filter((id) => allowlisted.has(id) && live.has(id)),
      added: ids.filter((id) => !baselineById.has(id)).length,
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
    if (result.retired > 0) notes.push(`${result.retired} post-baseline retirements`);
    if (result.renamedFiles > 0) notes.push(`${result.renamedFiles} renamed file(s)`);
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
      "A post-baseline id — added and retired inside one wave — needs `addedIn` as well, and either kind " +
      "may name `supersededBy`, the LIVE id that carries the retired claim. renames[] records the same " +
      "thing at file level and the gate checks both ends. Added tests are always allowed. Counts are " +
      "derived from the ID lists, never from prose.",
    idFormat: ID_FORMAT,
    listCommand: LIST_COMMAND,
    capturedFrom,
    packages: WRAPPER_PACKAGES.map((pkg) => ({
      name: pkg.name,
      dir: pkg.dir,
      count: current[pkg.name].length,
      tests: current[pkg.name],
    })),
    renames: previous?.renames ?? [],
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
      "\nTest manifest gate failed (G2): tests must be migrated, not deleted.\n" +
        `Restore the test, or record it in ${path.relative(REPO_ROOT, manifestPath)}: a pre-wave id ` +
        "goes in `removals[]` with a `reason` naming the removed subject (plus `supersededBy` when a " +
        "live test carries the claim); a test added and retired inside one wave needs `addedIn` too; " +
        "a moved FILE goes in `renames[]` as `{ fromFile, toFile, minIds, reason }`.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main();
}
