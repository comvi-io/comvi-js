/**
 * RC versioning for the release rehearsal.
 *
 * Rewrites, IN THE WORKING TREE ONLY (never committed, no changeset consumed):
 *   - every package in the `fixed` group of .changeset/config.json to
 *     `<next fixed version>-rc.<N>`, where the next version comes from
 *     sync-peer-ranges' `nextReleaseVersion()` (the same rule the real cut uses);
 *   - every other publishable workspace package that at least one changeset
 *     names (e.g. @comvi/locale-routing) to `<its own next version>-rc.<N>`,
 *     bumped by the max type its changesets declare;
 *   - every non-`workspace:` `@comvi/*` peer range to the EXACT rc version of
 *     that peer, because `^0.5.0` does not satisfy `0.5.0-rc.0` under semver
 *     prerelease rules and the RC soak installs from the registry. `workspace:*`
 *     dependency ranges are left alone: `pnpm publish` replaces them with the
 *     exact published version.
 *
 * `--rc <N>` is required; `--dry-run` prints the plan without writing.
 * Packages in `ignore` and private packages are untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextReleaseVersion } from "./sync-peer-ranges.mjs";

const ORDER = { patch: 1, minor: 2, major: 3 };

export function bump(version, type) {
  const [maj, min, patch] = version.split("-")[0].split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${patch + 1}`;
}

/** Max declared bump per package across .changeset/*.md frontmatter. */
export function declaredBumps(root) {
  const dir = path.join(root, ".changeset");
  const bumps = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^"?(@comvi\/[^"\s:]+)"?\s*:\s*"?(patch|minor|major)"?\s*$/);
      if (!m) continue;
      const [, name, type] = m;
      if ((ORDER[type] ?? 0) > (ORDER[bumps[name]] ?? 0)) bumps[name] = type;
    }
  }
  return bumps;
}

export function planRcVersions({ root, rc }) {
  if (!/^\d+$/.test(String(rc)))
    throw new Error(`--rc must be a non-negative integer, got "${rc}"`);
  const config = JSON.parse(fs.readFileSync(path.join(root, ".changeset/config.json"), "utf8"));
  const fixed = new Set((config.fixed ?? []).flat());
  const ignore = new Set(config.ignore ?? []);
  const fixedNext = nextReleaseVersion();
  if (fixedNext === null) throw new Error("no changesets: nothing to version");
  const bumps = declaredBumps(root);
  const manifests = [];
  const pkgsDir = path.join(root, "packages");
  for (const entry of fs.readdirSync(pkgsDir)) {
    const file = path.join(pkgsDir, entry, "package.json");
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pkg.private || ignore.has(pkg.name)) continue;
    let next;
    if (fixed.has(pkg.name)) next = fixedNext;
    else if (bumps[pkg.name]) next = bump(pkg.version, bumps[pkg.name]);
    else continue; // not released by this train
    manifests.push({ file, name: pkg.name, from: pkg.version, to: `${next}-rc.${rc}` });
  }
  const versions = Object.fromEntries(manifests.map((m) => [m.name, m.to]));
  return { manifests, versions };
}

export function applyRcVersions({ root, rc, dryRun = false, log = console.log }) {
  const { manifests, versions } = planRcVersions({ root, rc });
  for (const m of manifests) {
    const pkg = JSON.parse(fs.readFileSync(m.file, "utf8"));
    pkg.version = m.to;
    const peers = pkg.peerDependencies ?? {};
    const peerEdits = [];
    for (const name of Object.keys(peers)) {
      if (!name.startsWith("@comvi/") || peers[name].startsWith("workspace:")) continue;
      if (!versions[name]) throw new Error(`${m.name}: peer ${name} is not in this RC`);
      peerEdits.push(`${name}: ${peers[name]} -> ${versions[name]}`);
      peers[name] = versions[name];
    }
    log(
      `rc-version: ${m.name} ${m.from} -> ${m.to}${peerEdits.length ? ` (peers: ${peerEdits.join(", ")})` : ""}`,
    );
    if (!dryRun) fs.writeFileSync(m.file, JSON.stringify(pkg, null, 2) + "\n");
  }
  return { manifests, versions };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rcIdx = args.indexOf("--rc");
  const rc = rcIdx === -1 ? undefined : args[rcIdx + 1];
  if (rc === undefined) {
    console.error("usage: node scripts/rc-version.mjs --rc <N> [--dry-run]");
    process.exit(2);
  }
  applyRcVersions({ root: process.cwd(), rc, dryRun: args.includes("--dry-run") });
}
