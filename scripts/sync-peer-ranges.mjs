/**
 * Pins internal @comvi/* peer ranges to the minor line of the NEXT release.
 *
 * Policy: plugins peer-depend on the exact minor they ship with (^0.4.0 for
 * the 0.4.x release). Run before `changeset version` so the new version is
 * already in range — otherwise changesets escalates peer dependents (and the
 * whole fixed group) to a major bump.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const ORDER = { patch: 1, minor: 2, major: 3 };

export function declaredMaxBump() {
  const dir = path.join(root, ".changeset");
  let max = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    for (const line of fm[1].split("\n")) {
      const m = line.match(/:\s*"?(patch|minor|major)"?\s*$/);
      if (m) max = Math.max(max, ORDER[m[1]]);
    }
  }
  return max;
}

/**
 * The version the next release will publish for the `fixed` group, derived
 * from the branch's @comvi/core manifest — never from npm, because the branch
 * may already be ahead of (or behind) the published line.
 */
export function nextReleaseVersion() {
  const bump = declaredMaxBump();
  if (bump === 0) return null;
  const core = JSON.parse(fs.readFileSync(path.join(root, "packages/core/package.json"), "utf8"));
  let [maj, min, patch] = core.version.split(".").map(Number);
  if (bump === ORDER.major) {
    maj += 1;
    min = 0;
    patch = 0;
  } else if (bump === ORDER.minor) {
    min += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${maj}.${min}.${patch}`;
}

export function nextReleaseRange() {
  const version = nextReleaseVersion();
  if (version === null) return null;
  const [maj, min] = version.split(".");
  return `^${maj}.${min}.0`;
}

export function syncPeerRanges() {
  const range = nextReleaseRange();
  if (range === null) {
    console.log("sync-peer-ranges: no changesets, nothing to do");
    return;
  }
  const pkgsDir = path.join(root, "packages");
  for (const entry of fs.readdirSync(pkgsDir)) {
    const pkgPath = path.join(pkgsDir, entry, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const peers = pkg.peerDependencies;
    if (!peers) continue;
    let changed = false;
    for (const name of Object.keys(peers)) {
      if (!name.startsWith("@comvi/")) continue;
      if (peers[name].startsWith("workspace:")) continue;
      if (peers[name] !== range) {
        peers[name] = range;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`sync-peer-ranges: ${pkg.name} -> @comvi/* peer ${range}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncPeerRanges();
}
