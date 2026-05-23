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

const version = sorted[0].version;
const tag = `v${version}`;
const allSameVersion = sorted.every((p) => p.version === version);

if (!allSameVersion) {
  console.error(
    `Refusing to create ${tag}: all published packages must share one version.\n` +
      sorted.map((p) => `- ${p.name}@${p.version}`).join("\n"),
  );
  process.exit(1);
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
      run("pnpm", ["--dir", dir, "pack", "--pack-destination", packagesDir]);
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
        "All included `@comvi/*` packages are published from the same commit and share the same version.",
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
body += `Released \`${version}\` across all publishable \`@comvi/*\` packages.\n\n`;
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

const result = spawnSync(
  "gh",
  ["release", "create", tag, archiveAsset, "--title", tag, "--notes-file", "-"],
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
