/**
 * Pins internal @comvi/* peer ranges to the EXACT version of the next release.
 *
 * Policy (owner decision 22.11.2026, B3): core and every binding always ship the
 * same version, so a non-`workspace:` `@comvi/*` peer (today `@comvi/next`'s
 * `@comvi/core` and `@comvi/react`) is the next release's exact version — a patch
 * release too. Run before `changeset version`, so the new version already
 * satisfies the peer — otherwise changesets bumps the peer dependents on its own
 * account (by patch since @changesets/cli 3; cli 2 escalated them, and the whole
 * fixed group, to a major bump). The publish job checks the packed tarballs
 * (scripts/publish-candidate.mjs `exactComviVersions`).
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

export function syncPeerRanges() {
  const range = nextReleaseVersion();
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
