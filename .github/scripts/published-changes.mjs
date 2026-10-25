/**
 * The changeset guard in ci.yml: a pull request that changes what a published
 * package ships must add or edit a changeset.
 *
 * Published surface is `packages/<name>/src/**` and `packages/<name>/package.json`,
 * with one exemption: a package.json whose only change is `devDependencies`.
 * devDependencies never reach a consumer, and a Dependabot PR that bumps only
 * them would otherwise need a hand-written changeset. Any other manifest change
 * (dependencies, peerDependencies, optionalDependencies, exports, version, key
 * order, ...) still counts, and so does a manifest added or deleted.
 *
 * A changeset is a `.changeset/<name>.md` other than README.md that the pull
 * request ADDED or MODIFIED, so it exists at HEAD. Deleting one does not count.
 *
 *   node .github/scripts/published-changes.mjs <base-ref>
 *
 * Compares `<base-ref>...HEAD`. Exits 1 when published surface changed and no
 * changeset was added or edited; exits non-zero on any git or manifest error
 * that is not a plain "this file does not exist on that side" (fail closed).
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SURFACE = /^packages\/[^/]+\/(src\/|package\.json$)/;
const MANIFEST = /^packages\/[^/]+\/package\.json$/;
const CHANGESET = /^\.changeset\/[^/]+\.md$/;

/**
 * True when two package.json texts differ in `devDependencies` alone.
 * Whitespace does not matter; key order does, because Node resolves `exports`
 * and `imports` conditions in order. A missing side (`null`: the file was added
 * or deleted) or a text that does not parse is never devDependencies-only.
 */
export function onlyDevDependenciesChanged(baseText, headText) {
  if (baseText === null || headText === null) return false;
  let base;
  let head;
  try {
    base = JSON.parse(baseText);
    head = JSON.parse(headText);
  } catch {
    return false;
  }
  if (!isObject(base) || !isObject(head)) return false;
  delete base.devDependencies;
  delete head.devDependencies;
  return JSON.stringify(base) === JSON.stringify(head);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The output of `git diff --no-renames --name-status -z` as `{ status, path }`
 * entries. Without renames every entry is one status letter and one path, and
 * `-z` keeps paths unquoted, non-ASCII ones included.
 */
export function parseNameStatus(output) {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) throw new Error("unexpected `git diff --name-status -z` output");
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    entries.push({ status: fields[index], path: fields[index + 1] });
  }
  return entries;
}

/**
 * The published-surface paths among `files`. `read(side, file)` returns the
 * file's text at "base" or "head", or `null` when it does not exist there.
 */
export function publishedChanges(files, read) {
  return files.filter((file) => {
    if (!SURFACE.test(file)) return false;
    if (!MANIFEST.test(file)) return true;
    return !onlyDevDependenciesChanged(read("base", file), read("head", file));
  });
}

/** The changesets this diff added or edited (they exist at HEAD). */
export function changesetChanges(entries) {
  return entries
    .filter(({ status, path }) => (status === "A" || status === "M") && CHANGESET.test(path))
    .filter(({ path }) => path !== ".changeset/README.md")
    .map(({ path }) => path);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/** A file's text at `rev`, or `null` only when the path does not exist there. */
function gitShow(rev, file) {
  const listed = git(["ls-tree", "-z", "--name-only", rev, "--", file]);
  if (listed === "") return null;
  return git(["show", `${rev}:${file}`]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("usage: node .github/scripts/published-changes.mjs <base-ref>");
    process.exit(2);
  }
  const mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
  const entries = parseNameStatus(
    git(["diff", "--no-renames", "--name-status", "-z", `${mergeBase}...HEAD`]),
  );
  console.log("Changed files:");
  for (const { status, path } of entries) console.log(`  ${status} ${path}`);

  const published = publishedChanges(
    entries.map(({ path }) => path),
    (side, file) => gitShow(side === "base" ? mergeBase : "HEAD", file),
  );
  if (published.length === 0) {
    console.log(
      "No changes to packages/*/src/** or packages/*/package.json beyond devDependencies. Skipping changeset check.",
    );
    process.exit(0);
  }
  console.log("Published-surface changes detected:");
  for (const file of published) console.log(`  ${file}`);

  const changesets = changesetChanges(entries);
  if (changesets.length === 0) {
    console.log("Published package changes detected but no changeset file was added or edited.");
    console.log("Run 'pnpm changeset' and commit the generated .changeset/*.md file.");
    process.exit(1);
  }
  console.log("Changeset files detected:");
  for (const file of changesets) console.log(`  ${file}`);
}
