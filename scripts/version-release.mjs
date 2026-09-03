import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectChangesets,
  coordinatedVersion,
  getPublishablePackages,
  updateRootChangelogFile,
} from "./root-changelog.mjs";

/**
 * `error.code` on the one failure the CLI reports without a stack: the fixed
 * group did not land on a single version.
 */
export const COORDINATED_VERSION_FAILED = "E_COORDINATED_VERSION";

/** The real runner: inherits stdio and takes the process down on failure. */
function spawnOrExit(root) {
  return (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
}

// ---------------------------------------------------------------------------
// Breaking-entry hoist.
//
// `changeset version` writes the entries of a section in changeset-id order,
// which is a hash — so which breaking change a reader meets first in a release
// is effectively random and changes between cuts of the same content. Within
// the newly generated version block only, whole `- ` bullets whose text starts
// with `**BREAKING` move to the top of their section, ordered by the changeset
// FILENAME they came from. Everything else keeps the order changesets chose.
// ---------------------------------------------------------------------------

/** The sections whose order is ours to decide. `Major Changes` is not one of
 *  them: every entry there is breaking, so hoisting would only reshuffle. */
const HOISTED_SECTIONS = new Set(["### Minor Changes", "### Patch Changes"]);

/** A bullet's own text: `- ` and the `<hash>: ` prefix changesets prepends when
 *  it has a commit to name are both packaging, not content. */
function bulletText(firstLine) {
  return firstLine.replace(/^- /, "").replace(/^[0-9a-f]{7,40}: /, "");
}

const isBreaking = (text) => text.startsWith("**BREAKING");

/**
 * Maps a bullet back to the changeset it was generated from by its first line,
 * which `@changesets/cli/changelog` copies verbatim. Returns the changeset
 * filename, or undefined when nothing matches (a hand-edited entry).
 */
export function changesetOrder(changesets) {
  const byFirstLine = new Map();
  for (const changeset of changesets) {
    const first = changeset.body.split("\n")[0].trim();
    if (first && !byFirstLine.has(first)) byFirstLine.set(first, changeset.id);
  }
  return (text) => byFirstLine.get(text.split("\n")[0].trim());
}

/** Splits section lines into the blank-line preamble and one entry per `- `
 *  bullet, each keeping its own continuation and trailing blank lines. */
function splitBullets(lines) {
  const preamble = [];
  const bullets = [];
  for (const line of lines) {
    if (line.startsWith("- ")) bullets.push([line]);
    else if (bullets.length === 0) preamble.push(line);
    else bullets[bullets.length - 1].push(line);
  }
  return { preamble, bullets };
}

function hoistSection(lines, orderOf) {
  const { preamble, bullets } = splitBullets(lines);
  if (bullets.length < 2) return lines;
  const keyed = bullets.map((bullet, index) => {
    const text = bulletText(bullet[0]);
    return { bullet, index, breaking: isBreaking(text), order: orderOf(text) };
  });
  if (!keyed.some((entry) => entry.breaking)) return lines;
  const sorted = [
    ...keyed
      .filter((entry) => entry.breaking)
      // A bullet with no matching changeset keeps its relative position after
      // the ones that have a filename to sort by.
      .sort(
        (a, b) =>
          (a.order === undefined) - (b.order === undefined) ||
          (a.order ?? "").localeCompare(b.order ?? "") ||
          a.index - b.index,
      ),
    ...keyed.filter((entry) => !entry.breaking),
  ];
  return [...preamble, ...sorted.flatMap((entry) => entry.bullet)];
}

/**
 * Rewrites the `## <version>` block of one CHANGELOG. Returns the file content
 * unchanged when the version has no block or no section needs a hoist.
 */
export function hoistBreakingEntries(changelog, version, orderOf) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`);
  if (start === -1) return changelog;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  const block = lines.slice(start, end);
  const out = [];
  let sectionStart = -1;
  const flush = (at) => {
    if (sectionStart === -1) return;
    out.push(...hoistSection(block.slice(sectionStart, at), orderOf));
    sectionStart = -1;
  };
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    if (line.startsWith("### ")) {
      flush(i);
      out.push(line);
      if (HOISTED_SECTIONS.has(line.trimEnd())) sectionStart = i + 1;
      continue;
    }
    if (sectionStart === -1) out.push(line);
  }
  flush(block.length);

  return [...lines.slice(0, start), ...out, ...lines.slice(end)].join("\n");
}

/** Applies the hoist to every package CHANGELOG's just-generated version block
 *  (the block named by the version `changeset version` left in the manifest). */
export function hoistBreakingEntriesInRepo({ root, changesets, log = console.log }) {
  const orderOf = changesetOrder(changesets);
  const packagesDir = path.join(root, "packages");
  const hoisted = [];
  for (const entry of fs.readdirSync(packagesDir)) {
    const manifest = path.join(packagesDir, entry, "package.json");
    const changelogPath = path.join(packagesDir, entry, "CHANGELOG.md");
    if (!fs.existsSync(manifest) || !fs.existsSync(changelogPath)) continue;
    const { name, version, private: isPrivate } = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (isPrivate) continue;
    const changelog = fs.readFileSync(changelogPath, "utf8");
    const updated = hoistBreakingEntries(changelog, version, orderOf);
    if (updated === changelog) continue;
    fs.writeFileSync(changelogPath, updated);
    hoisted.push(name);
  }
  if (hoisted.length > 0) log(`root-changelog: hoisted BREAKING entries in ${hoisted.join(", ")}`);
  return hoisted;
}

/**
 * The release cut, in the order it has to happen:
 *
 *   1. `sync-peer-ranges`, BEFORE `changeset version` — otherwise changesets
 *      sees an internal peer range that the new version falls outside of and
 *      escalates the whole fixed group to a major bump;
 *   2. `changeset version`;
 *   3. the breaking-entry hoist over the version blocks step 2 just generated;
 *   4. the root CHANGELOG entry, and only when this cut consumed changesets.
 *
 * The changesets are collected BEFORE step 2 because `changeset version`
 * deletes them. `run` is injectable so a test can assert the order without
 * spawning anything.
 *
 * `skipRootChangelog` (CLI: `--skip-root-changelog`) returns after step 2,
 * before the hoist and the root CHANGELOG entry. It is deliberately NOT called
 * a dry run: steps 1 and 2 have already run by then, so the working tree is
 * fully versioned and the changesets are consumed either way. A real dry run is
 * not possible here — the version is not known until `changeset version` has
 * decided it.
 */
export function main({
  root = process.cwd(),
  skipRootChangelog = false,
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
  let version;
  try {
    version = coordinatedVersion(packages);
  } catch (error) {
    // The one failure whose message stands on its own, so the CLI prints it
    // without a stack. Anything else escaping `main` is a bug and keeps one.
    error.code ??= COORDINATED_VERSION_FAILED;
    throw error;
  }
  // The release PR is created before npm publication, so its timestamp is not
  // the release date. Keep generated headings undated unless an exact date is
  // supplied.
  const date = process.env.CHANGELOG_DATE;
  if (skipRootChangelog) {
    log(`root-changelog: would add coordinated ${version} release`);
    return { versioned: true, version, changed: false, hoisted: [] };
  }
  const hoisted = hoistBreakingEntriesInRepo({ root, changesets, log });
  const changed = updateRootChangelogFile({ root, version, date, changesets, packages });
  log(
    changed
      ? `root-changelog: added coordinated ${version} release`
      : `root-changelog: ${version} already present`,
  );
  return { versioned: true, version, changed, hoisted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main({ skipRootChangelog: process.argv.includes("--skip-root-changelog") });
  } catch (error) {
    // Narrow on purpose: only the coordinated-version failure is a message a
    // release captain can act on. A malformed changeset, an fs error in the
    // hoist or a throw out of updateRootChangelogFile is a bug, and swallowing
    // its stack makes a broken cut harder to debug than it already is.
    if (error?.code !== COORDINATED_VERSION_FAILED) throw error;
    console.error(`root-changelog: ${error.message}`);
    process.exit(1);
  }
}
