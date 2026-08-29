import fs from "node:fs";
import path from "node:path";

const BUMP_ORDER = { patch: 1, minor: 2, major: 3 };
const BUMP_LABELS = {
  major: "Major Changes",
  minor: "Minor Changes",
  patch: "Patch Changes",
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseChangeset(source, id = "changeset") {
  const normalized = source.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${id}: invalid changeset frontmatter`);

  const releases = [];
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const entry = line.trim().match(/^["']?([^"']+?)["']?\s*:\s*["']?(patch|minor|major)["']?\s*$/);
    if (!entry) throw new Error(`${id}: invalid release entry: ${line}`);
    releases.push({ name: entry[1], type: entry[2] });
  }

  const body = match[2].trim();
  if (releases.length === 0) throw new Error(`${id}: changeset has no package releases`);
  if (!body) throw new Error(`${id}: changeset has no summary`);

  return { id, releases, body };
}

export function collectChangesets(root) {
  const changesetDir = path.join(root, ".changeset");
  return fs
    .readdirSync(changesetDir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort()
    .map((file) => parseChangeset(fs.readFileSync(path.join(changesetDir, file), "utf8"), file));
}

export function getPublishablePackages(root) {
  const packagesDir = path.join(root, "packages");
  return fs
    .readdirSync(packagesDir)
    .flatMap((entry) => {
      const packagePath = path.join(packagesDir, entry, "package.json");
      if (!fs.existsSync(packagePath)) return [];
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return packageJson.private ? [] : [{ name: packageJson.name, version: packageJson.version }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Packages versioned independently of the coordinated release
// (not members of the changeset `fixed` group; e.g. @comvi/locale-routing@0.1.0).
const INDEPENDENT_PACKAGES = new Set(["@comvi/locale-routing"]);

export function coordinatedVersion(packages) {
  const coordinated = packages.filter((pkg) => !INDEPENDENT_PACKAGES.has(pkg.name));
  if (coordinated.length === 0) throw new Error("no publishable packages found");
  const versions = [...new Set(coordinated.map((pkg) => pkg.version))];
  if (versions.length !== 1) {
    throw new Error(
      `publishable packages must share one version:\n${coordinated
        .map((pkg) => `- ${pkg.name}@${pkg.version}`)
        .join("\n")}`,
    );
  }
  return versions[0];
}

export function summarizeChangeset(body) {
  const lines = body.split("\n").map((line) => line.trim());
  const start = lines.findIndex(Boolean);
  if (start < 0) throw new Error("changeset has no summary");

  const summaryLines = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (!line || (index > start && /^(?:[-*+]\s|#{1,6}\s|```)/.test(line))) break;
    summaryLines.push(line);
  }

  return summaryLines
    .join(" ")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/:\s*$/, "");
}

function changesetBump(changeset) {
  return changeset.releases.reduce(
    (highest, release) => (BUMP_ORDER[release.type] > BUMP_ORDER[highest] ? release.type : highest),
    "patch",
  );
}

function formatScope(changeset, publishablePackageNames) {
  const names = [...new Set(changeset.releases.map((release) => release.name))].sort();
  if (
    names.length === publishablePackageNames.length &&
    names.every((name, index) => name === publishablePackageNames[index])
  ) {
    return "All packages";
  }
  return names.join(", ");
}

export function renderRootReleaseSection({ version, date, changesets, publishablePackageNames }) {
  if (!version) throw new Error("version is required");
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid release date: ${date}`);
  }
  if (changesets.length === 0) throw new Error("at least one changeset is required");

  const allNames = [...publishablePackageNames].sort();
  const grouped = { major: [], minor: [], patch: [] };
  for (const changeset of changesets) grouped[changesetBump(changeset)].push(changeset);

  const lines = [
    `## [${version}]${date ? ` - ${date}` : ""}`,
    "",
    `Coordinated \`${version}\` release for the main \`@comvi/*\` package train. Independently versioned packages included below keep their own versions. Detailed package-level notes and migration guidance are available in the linked GitHub Release.`,
  ];

  for (const bump of ["major", "minor", "patch"]) {
    if (grouped[bump].length === 0) continue;
    lines.push("", `### ${BUMP_LABELS[bump]}`, "");
    for (const changeset of grouped[bump]) {
      const scope = formatScope(changeset, allNames);
      lines.push(`- **${scope}** — ${summarizeChangeset(changeset.body)}`);
    }
  }

  return lines.join("\n");
}

export function updateRootChangelogContent({
  changelog,
  version,
  date,
  changesets,
  publishablePackageNames,
  releaseUrl = `https://github.com/comvi-io/comvi-js/releases/tag/v${version}`,
}) {
  const versionPattern = escapeRegExp(version);
  if (new RegExp(`^## \\[${versionPattern}\\](?:\\s|$)`, "m").test(changelog)) {
    return { changed: false, content: changelog };
  }

  const section = renderRootReleaseSection({
    version,
    date,
    changesets,
    publishablePackageNames,
  });
  const firstRelease = changelog.search(/^## \[/m);
  if (firstRelease < 0) throw new Error("root changelog has no release heading");

  let content = `${changelog.slice(0, firstRelease)}${section}\n\n${changelog.slice(firstRelease)}`;
  const linkPattern = new RegExp(`^\\[${versionPattern}\\]:`, "m");
  if (!linkPattern.test(content)) {
    const firstLink = content.search(/^\[[^\]]+\]:\s+https?:\/\//m);
    const link = `[${version}]: ${releaseUrl}\n`;
    content =
      firstLink >= 0
        ? `${content.slice(0, firstLink)}${link}${content.slice(firstLink)}`
        : `${content.trimEnd()}\n\n${link}`;
  }

  return { changed: true, content: content.endsWith("\n") ? content : `${content}\n` };
}

export function updateRootChangelogFile({ root, version, date, changesets, packages }) {
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const result = updateRootChangelogContent({
    changelog,
    version,
    date,
    changesets,
    publishablePackageNames: packages.map((pkg) => pkg.name),
  });
  if (result.changed) fs.writeFileSync(changelogPath, result.content);
  return result.changed;
}
