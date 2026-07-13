import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  collectChangesets,
  coordinatedVersion,
  getPublishablePackages,
  updateRootChangelogFile,
} from "./root-changelog.mjs";

const root = process.cwd();

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const changesets = collectChangesets(root);
run(process.execPath, [path.join(root, "scripts/sync-peer-ranges.mjs")]);
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "changeset", "version"]);

if (changesets.length === 0) {
  console.log("root-changelog: no changesets, nothing to update");
  process.exit(0);
}

const packages = getPublishablePackages(root);
let version;
try {
  version = coordinatedVersion(packages);
} catch (error) {
  console.error(`root-changelog: ${error.message}`);
  process.exit(1);
}
// The release PR is created before npm publication, so its timestamp is not the
// release date. Keep generated headings undated unless an exact date is supplied.
const date = process.env.CHANGELOG_DATE;
const changed = updateRootChangelogFile({ root, version, date, changesets, packages });
console.log(
  changed
    ? `root-changelog: added coordinated ${version} release`
    : `root-changelog: ${version} already present`,
);
