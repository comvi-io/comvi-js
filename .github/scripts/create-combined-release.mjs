import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { tarballName } from "../../scripts/examples-e2e/lib.mjs";

const published = JSON.parse(process.env.PUBLISHED_PACKAGES ?? "[]");
if (published.length === 0) {
  console.log("No packages were published — skipping combined release.");
  process.exit(0);
}

const packagesRoot = "packages";
const nameToPath = {};
for (const entry of readdirSync(packagesRoot)) {
  const dir = `${packagesRoot}/${entry}`;
  if (!statSync(dir).isDirectory()) continue;
  try {
    const { name } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
    if (name) nameToPath[name] = dir;
  } catch {
    // ignore packages without parsable package.json
  }
}

const sorted = [...published].sort((a, b) => {
  if (a.name === "@comvi/core") return -1;
  if (b.name === "@comvi/core") return 1;
  return a.name.localeCompare(b.name);
});

// The tag comes from the release train: the `fixed` group of
// .changeset/config.json, whose members always share one version. Anything
// published outside that group is versioned independently; today NOTHING is —
// every publishable package is a member, and the two packages that are not
// (locale-routing, typegen) are workspace-private and publish nothing at all.
// The code path stays because the config can grow one back, and the config is
// the single place that decision is recorded, so read it instead of keeping a
// second hard-coded list here (scripts/root-changelog.mjs reads the same set
// through `fixedGroupNames`). Independent packages keep their own version in
// the release notes, in manifest.json and in the archive.
const changesetConfig = JSON.parse(readFileSync(".changeset/config.json", "utf8"));
const fixedGroup = new Set((changesetConfig.fixed ?? []).flat());
const trainPackages = sorted.filter((p) => fixedGroup.has(p.name));
const independentPackages = sorted.filter((p) => !fixedGroup.has(p.name));

if (trainPackages.length === 0) {
  console.error(
    "Refusing to create a release: no published package belongs to the `fixed` group in " +
      ".changeset/config.json, so there is no release-train version to tag.\n" +
      sorted.map((p) => `- ${p.name}@${p.version}`).join("\n"),
  );
  process.exit(1);
}

const version = trainPackages[0].version;
const tag = `v${version}`;

if (!trainPackages.every((p) => p.version === version)) {
  console.error(
    `Refusing to create ${tag}: published packages in the \`fixed\` group must share one version.\n` +
      trainPackages.map((p) => `- ${p.name}@${p.version}`).join("\n"),
  );
  process.exit(1);
}

// Provenance: the publish step pushed `tag` at the checked-out release commit
// together with the package tags, after npm confirmed the whole candidate.
// Refuse anything else — `gh release create` without an existing tag would
// create one from the default branch's CURRENT head, which may be newer than
// the bytes npm received.
const git = (args) => spawnSync("git", args, { encoding: "utf8" });
const head = git(["rev-parse", "HEAD"]).stdout.trim();
const tagged = git(["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]);
if (tagged.status !== 0) {
  console.error(
    `Refusing to create the release: tag ${tag} does not exist in this checkout. ` +
      "The publish step creates and pushes it at the release commit once every candidate is on npm.",
  );
  process.exit(1);
}
if (tagged.stdout.trim() !== head) {
  console.error(
    `Refusing to create the release: ${tag} points at ${tagged.stdout.trim()}, ` +
      `but the checked-out release commit is ${head}.`,
  );
  process.exit(1);
}

// Completeness: the archive is the whole candidate or nothing. Every tarball
// the pack job's SHA256SUMS lists must be in the published set, and nothing
// else may be.
const tarballsDir = process.env.COMVI_RELEASE_TARBALLS_DIR;
if (tarballsDir) {
  const listed = readFileSync(join(tarballsDir, "SHA256SUMS"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1]);
  // pnpm pack's file name, from the same function the pack and publish steps use.
  const publishedFiles = sorted.map(tarballName);
  const missing = listed.filter((file) => !publishedFiles.includes(file));
  const extra = publishedFiles.filter((file) => !listed.includes(file));
  if (missing.length > 0 || extra.length > 0) {
    console.error(
      `Refusing to create ${tag}: the published set is not the candidate.` +
        (missing.length > 0 ? `\nin SHA256SUMS, not published: ${missing.join(", ")}` : "") +
        (extra.length > 0 ? `\npublished, not in SHA256SUMS: ${extra.join(", ")}` : ""),
    );
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function createReleaseArchive() {
  const tmpRoot = mkdtempSync(join(tmpdir(), "comvi-release-"));
  const archiveRootName = `comvi-v${version}`;
  const archiveRoot = join(tmpRoot, archiveRootName);
  const packagesDir = join(archiveRoot, "packages");
  mkdirSync(packagesDir, { recursive: true });

  const manifest = {
    name: "comvi",
    version,
    generatedAt: new Date().toISOString(),
    packages: [],
  };

  try {
    for (const pkg of sorted) {
      const dir = nameToPath[pkg.name];
      if (!dir) {
        console.error(`Could not find workspace path for published package ${pkg.name}`);
        process.exit(1);
      }

      const before = new Set(readdirSync(packagesDir));
      // COMVI_RELEASE_TARBALLS_DIR: the release job's verified candidate (what
      // npm just received), copied rather than re-packed — the publishing job
      // has no install and no build to pack from.
      if (tarballsDir) {
        const file = tarballName(pkg);
        copyFileSync(join(tarballsDir, file), join(packagesDir, file));
      } else {
        run("pnpm", ["--dir", dir, "pack", "--pack-destination", packagesDir]);
      }
      const created = readdirSync(packagesDir).filter((file) => !before.has(file));
      if (created.length !== 1) {
        console.error(`Expected one tarball for ${pkg.name}, found ${created.length}`);
        process.exit(1);
      }

      const fileName = created[0];
      const filePath = join(packagesDir, fileName);
      manifest.packages.push({
        name: pkg.name,
        version: pkg.version,
        file: `packages/${fileName}`,
        sha256: sha256(filePath),
      });
    }

    writeFileSync(join(archiveRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(
      join(archiveRoot, "SHA256SUMS"),
      `${manifest.packages.map((pkg) => `${pkg.sha256}  ${pkg.file}`).join("\n")}\n`,
    );
    writeFileSync(
      join(archiveRoot, "README.md"),
      [
        `# Comvi ${version}`,
        "",
        "This archive contains the npm tarballs for the coordinated Comvi release.",
        "All included `@comvi/*` packages are published from the same commit. The release train shares",
        `version \`${version}\`; independently versioned packages keep their own version. Every package's`,
        "own version is recorded in `manifest.json`.",
        "",
        "Use `manifest.json` for package metadata and `SHA256SUMS` for integrity checks.",
        "",
      ].join("\n"),
    );

    const archivePath = join(tmpRoot, `${archiveRootName}.tar.gz`);
    run("tar", ["-czf", archivePath, "-C", tmpRoot, archiveRootName]);

    const outputDir = process.env.COMVI_RELEASE_ARCHIVE_DIR ?? ".";
    mkdirSync(outputDir, { recursive: true });
    const finalPath = join(outputDir, `${archiveRootName}.tar.gz`);
    copyFileSync(archivePath, finalPath);
    console.log(`Created release archive ${finalPath}`);
    return finalPath;
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function extractVersionSection(changelog, v) {
  const escaped = v.replace(/\./g, "\\.");
  const re = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = changelog.match(re);
  return match ? match[1].trim() : "";
}

let body = "";
body += `Released \`${version}\` across the coordinated \`@comvi/*\` release train.\n\n`;
if (independentPackages.length > 0) {
  body += `Independently versioned in this release: ${independentPackages
    .map((p) => `\`${p.name}@${p.version}\``)
    .join(", ")}.\n\n`;
}
body += `The GitHub Release asset \`comvi-v${version}.tar.gz\` is the single archive for this release. It contains the packed npm tarballs plus \`manifest.json\` and \`SHA256SUMS\`.\n\n`;

for (const pkg of sorted) {
  const dir = nameToPath[pkg.name];
  if (!dir) continue;
  let changelog;
  try {
    changelog = readFileSync(`${dir}/CHANGELOG.md`, "utf8");
  } catch {
    continue;
  }
  const section = extractVersionSection(changelog, pkg.version);
  if (!section) continue;
  const demoted = section.replace(/^(#{1,5}) /gm, "#$1 ");
  body += `### \`${pkg.name}\`\n\n${demoted}\n\n`;
}

if (!body.trim()) {
  body = `Released packages: ${sorted.map((p) => `\`${p.name}@${p.version}\``).join(", ")}`;
}

console.log(`Creating GitHub Release: ${tag}`);
console.log("---BODY---");
console.log(body);
console.log("---END BODY---");

const archivePath = createReleaseArchive();
const archiveAsset = `${archivePath}#${basename(archivePath)}`;

if (process.env.COMVI_RELEASE_DRY_RUN === "1") {
  console.log(`Dry run enabled — would create ${tag} with asset ${archiveAsset}`);
  process.exit(0);
}

// Retry-safe: a run whose `gh release create` made the release but failed
// uploading the asset leaves a release behind. The tag (verified above to be
// this commit) is the same, so re-upload the archive to it instead of failing
// on "already exists". Any gh failure other than "release not found" stops.
const existing = spawnSync("gh", ["release", "view", tag, "--json", "tagName"], {
  encoding: "utf8",
});
if (existing.status === 0) {
  const { tagName } = JSON.parse(existing.stdout);
  if (tagName !== tag) {
    console.error(`gh release view ${tag} returned a release for ${tagName}`);
    process.exit(1);
  }
  console.log(`${tag} already has a GitHub Release; re-uploading ${basename(archivePath)}`);
  const upload = spawnSync("gh", ["release", "upload", tag, archiveAsset, "--clobber"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (upload.status !== 0) {
    console.error(`gh release upload exited with code ${upload.status}`);
    process.exit(upload.status ?? 1);
  }
  process.exit(0);
}
if (!/release not found/i.test(existing.stderr)) {
  console.error(`gh release view ${tag} failed:\n${existing.stderr}`);
  process.exit(existing.status ?? 1);
}

const result = spawnSync(
  "gh",
  ["release", "create", tag, archiveAsset, "--verify-tag", "--title", tag, "--notes-file", "-"],
  {
    input: body,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  console.error(`gh release create exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}
