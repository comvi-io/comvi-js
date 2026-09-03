import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectChangesets,
  coordinatedVersion,
  getPublishablePackages,
  updateRootChangelogFile,
} from "./root-changelog.mjs";

/** The real runner: inherits stdio and takes the process down on failure. */
function spawnOrExit(root) {
  return (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
}

/**
 * The release cut, in the order it has to happen:
 *
 *   1. `sync-peer-ranges`, BEFORE `changeset version` — otherwise changesets
 *      sees an internal peer range that the new version falls outside of and
 *      escalates the whole fixed group to a major bump;
 *   2. `changeset version`;
 *   3. the root CHANGELOG entry, and only when this cut consumed changesets.
 *
 * The changesets are collected BEFORE step 2 because `changeset version`
 * deletes them. `run` is injectable so a test can assert the order without
 * spawning anything; `dryRun` stops short of writing the root CHANGELOG.
 */
export function main({
  root = process.cwd(),
  dryRun = false,
  run = spawnOrExit(root),
  log = console.log,
} = {}) {
  const changesets = collectChangesets(root);
  run(process.execPath, [path.join(root, "scripts/sync-peer-ranges.mjs")]);
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "changeset", "version"]);

  if (changesets.length === 0) {
    log("root-changelog: no changesets, nothing to update");
    return { versioned: false };
  }

  const packages = getPublishablePackages(root);
  const version = coordinatedVersion(packages);
  // The release PR is created before npm publication, so its timestamp is not
  // the release date. Keep generated headings undated unless an exact date is
  // supplied.
  const date = process.env.CHANGELOG_DATE;
  if (dryRun) {
    log(`root-changelog: would add coordinated ${version} release`);
    return { versioned: true, version, changed: false };
  }
  const changed = updateRootChangelogFile({ root, version, date, changesets, packages });
  log(
    changed
      ? `root-changelog: added coordinated ${version} release`
      : `root-changelog: ${version} already present`,
  );
  return { versioned: true, version, changed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main({ dryRun: process.argv.includes("--dry-run") });
  } catch (error) {
    console.error(`root-changelog: ${error.message}`);
    process.exit(1);
  }
}
