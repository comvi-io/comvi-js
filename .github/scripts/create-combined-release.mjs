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
import { gzipSync } from "node:zlib";

import { tarballName } from "../../scripts/examples-e2e/lib.mjs";
import { htmlCommentLines, stripHtmlComments } from "./check-release-notes.mjs";

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

// Every time in the archive is the release commit's committer time.
const releaseEpoch = Number(git(["show", "-s", "--format=%ct", head]).stdout.trim());
if (!Number.isInteger(releaseEpoch) || releaseEpoch <= 0) {
  console.error(`cannot read the commit time of ${head}`);
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

/**
 * A gzipped ustar archive of `root` (named `rootName` inside), byte for byte
 * the same for the same files: entries in byte order of their paths, owner 0,
 * mode 0755/0644, every mtime `epoch`, and no gzip timestamp. A retry that
 * re-uploads the asset (`--clobber`) therefore re-uploads the same bytes.
 * System `tar` cannot promise that portably (bsdtar has no `--sort`).
 */
function reproducibleTarGz(root, rootName, epoch) {
  const blocks = [];
  const header = (name, type, size) => {
    if (Buffer.byteLength(name) > 100) throw new Error(`archive path too long: ${name}`);
    const block = Buffer.alloc(512);
    const field = (offset, length, value) => block.write(value, offset, length, "utf8");
    const octal = (offset, length, value) =>
      field(offset, length - 1, value.toString(8).padStart(length - 1, "0"));
    field(0, 100, name);
    octal(100, 8, type === "5" ? 0o755 : 0o644);
    octal(108, 8, 0);
    octal(116, 8, 0);
    octal(124, 12, size);
    octal(136, 12, epoch);
    field(148, 8, " ".repeat(8));
    field(156, 1, type);
    field(257, 6, "ustar");
    field(263, 2, "00");
    let sum = 0;
    for (const byte of block) sum += byte;
    field(148, 7, `${sum.toString(8).padStart(6, "0")}\0`);
    blocks.push(block);
  };
  const walk = (dir, name) => {
    header(`${name}/`, "5", 0);
    const entries = readdirSync(dir).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${name}/${entry}`);
        continue;
      }
      const data = readFileSync(full);
      header(`${name}/${entry}`, "0", data.length);
      blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
  };
  walk(root, rootName);
  blocks.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(blocks), { level: 9 });
  // The gzip header's MTIME is already 0; its OS byte is the build platform's
  // (19 on macOS): pin it to Unix (3), as `gzip -n` writes it.
  gz[9] = 3;
  return gz;
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
    // The release commit's time, not the clock's: the archive must be the
    // same bytes every time it is built for this release (see below).
    generatedAt: new Date(releaseEpoch * 1000).toISOString(),
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

    const outputDir = process.env.COMVI_RELEASE_ARCHIVE_DIR ?? ".";
    mkdirSync(outputDir, { recursive: true });
    const finalPath = join(outputDir, `${archiveRootName}.tar.gz`);
    writeFileSync(finalPath, reproducibleTarGz(archiveRoot, archiveRootName, releaseEpoch));
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

// GitHub rejects a release body above 125,000 characters, and this step runs
// after npm publish, where a failure cannot be undone. The body is therefore
// built to a cap well below that limit and never fails because of length.
const BODY_LIMIT = 100_000;

const repository = process.env.GITHUB_REPOSITORY;
const repositoryUrl = repository
  ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}`
  : null;

/** Where the rest of a cut section is: the file at the release tag. */
function changelogPointer(dir) {
  const file = `${dir}/CHANGELOG.md`;
  const target = repositoryUrl
    ? `[\`${file}\`](${repositoryUrl}/blob/${tag}/${file})`
    : `\`${file}\``;
  return `_Truncated. Full changelog: ${target}._`;
}

/**
 * `text` cut to at most `limit` characters at the end of a line. A code fence
 * left open by the cut is closed at its own indentation: inside a list item an
 * unindented fence would open a new block instead, and the rest of the body
 * would render as code.
 */
const FENCE_RESERVE = 40;
function cutAtLine(text, limit) {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.max(0, limit - FENCE_RESERVE));
  const cut = head.slice(0, Math.max(0, head.lastIndexOf("\n"))).trimEnd();
  const fences = [...cut.matchAll(/^([ \t]*)```/gm)];
  if (fences.length % 2 === 0) return cut;
  return `${cut}\n${fences.at(-1)[1].slice(0, FENCE_RESERVE - 4)}\`\`\``;
}

let intro = `Released \`${version}\` across the coordinated \`@comvi/*\` release train.\n\n`;
if (independentPackages.length > 0) {
  intro += `Independently versioned in this release: ${independentPackages
    .map((p) => `\`${p.name}@${p.version}\``)
    .join(", ")}.\n\n`;
}
intro += `The GitHub Release asset \`comvi-v${version}.tar.gz\` is the single archive for this release. It contains the packed npm tarballs plus \`manifest.json\` and \`SHA256SUMS\`.\n\n`;

const sections = [];
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
  sections.push({
    heading: `### \`${pkg.name}\`\n\n`,
    text: section.replace(/^(#{1,5}) /gm, "#$1 "),
    pointer: changelogPointer(dir),
  });
}
// What every section costs even when its text is cut to nothing.
const sectionOverhead = (s) => s.heading.length + s.pointer.length + 4;
const overhead = sections.reduce((sum, s) => sum + sectionOverhead(s), 0);

// The hand-written notes of this version, when the repository has them. They
// come first and are cut only if they alone would not leave room for the
// package headings.
let highlights = "";
try {
  highlights = readFileSync(`.github/release-notes/${version}.md`, "utf8").trim();
} catch {
  // no hand-written notes for this version
}
// The pack job fails a release whose notes hold an HTML comment
// (check-release-notes.mjs), on this same commit, so none should arrive here.
// If one does, npm is already live and the notes cannot change at this commit:
// a refusal would leave the release without a GitHub Release that no re-run
// can create. The comments are cut instead, with a warning, and the missing
// text is added afterwards with `gh release edit`. Which comments those are
// is check-release-notes.mjs's decision, shared with the pack job's check: a
// comment shown in a code block or a code span is content and stays.
for (const line of htmlCommentLines(highlights)) {
  console.log(
    `::warning file=.github/release-notes/${version}.md,line=${line},title=HTML comment cut from the release notes::` +
      `.github/release-notes/${version}.md:${line} holds an HTML comment; it is left out of the ${tag} release body. ` +
      "If it marked missing text, add that text with `gh release edit`.",
  );
}
highlights = stripHtmlComments(highlights).trim();
if (highlights) {
  highlights = `${cutAtLine(highlights, Math.max(0, BODY_LIMIT - intro.length - overhead - 2))}\n\n`;
}

// Share what is left between the sections: one that fits its share is kept
// whole, and what it does not use goes to the longer ones.
let budget = BODY_LIMIT - intro.length - highlights.length - overhead;
const bySize = [...sections].sort((a, b) => a.text.length - b.text.length);
for (const [index, section] of bySize.entries()) {
  const share = Math.max(0, Math.floor(budget / (bySize.length - index)));
  if (section.text.length > share) {
    const cut = cutAtLine(section.text, share);
    section.text = cut ? `${cut}\n\n${section.pointer}` : section.pointer;
    budget -= cut.length;
  } else {
    budget -= section.text.length;
  }
}

let body = intro + highlights;
for (const section of sections) body += `${section.heading}${section.text}\n\n`;

if (!body.trim()) {
  body = `Released packages: ${sorted.map((p) => `\`${p.name}@${p.version}\``).join(", ")}`;
}

// The exact notes, for a preview and for the tests: a pipe on macOS drops what
// is still queued at `process.exit`, so stdout cannot carry a long body.
if (process.env.COMVI_RELEASE_BODY_FILE) writeFileSync(process.env.COMVI_RELEASE_BODY_FILE, body);

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
