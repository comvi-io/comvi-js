/**
 * The changeset guard in ci.yml: a pull request that changes what a published
 * package ships must add or edit a changeset.
 *
 * Published surface, per package (`publishedPath`):
 *   - its package.json, except a change to `devDependencies` alone: those never
 *     reach a consumer, and a Dependabot PR that bumps only them would
 *     otherwise need a hand-written changeset. Any other manifest change
 *     (dependencies, peerDependencies, exports, version, key order, ...) counts,
 *     and so does a manifest added or deleted;
 *   - with `files`: everything under a `files` entry, `src/` (what dist is
 *     built from), the `bin`/`main`/`module`/`types`/`exports` targets, the
 *     build configs (vite.config.*, vite.shared.*, tsconfig*.json other than
 *     test ones, ...) and every file its build scripts name, inside the package
 *     or not (tooling/qualify-dts-specifiers.mjs);
 *   - without `files`, or with a manifest that cannot be read (fail closed):
 *     everything under packages/<name>/ but tests, README, CHANGELOG and docs/.
 * Tests (tests/, __tests__/, *.test.*, *.spec.*) never count.
 *
 * The release PR that `changeset version` opens consumes changesets instead of
 * adding one: it deletes them and moves every manifest's `version` (and, on a
 * minor, the `@comvi/*` ranges sync-peer-ranges.mjs moves). A diff whose every
 * changeset entry is a deletion is read as that commit: there a manifest change
 * that touches only `version`, `devDependencies` and plain `@comvi/*` version
 * ranges does not count (`onlyReleaseVersionChanged`). Any other
 * change in such a diff, such as `src/` or a third-party range, still does.
 *
 * A changeset is a `.changeset/<name>.md` other than README.md that the pull
 * request ADDED or MODIFIED (so it exists at HEAD) and that parses as one,
 * with a release entry and a summary (`parseChangeset`, the parser the release
 * itself uses). Deleting one does not count.
 *
 *   node .github/scripts/published-changes.mjs <base-ref>
 *
 * Compares `<base-ref>...HEAD`. Exits 1 when published surface changed and no
 * changeset was added or edited; exits non-zero on any git or manifest error
 * that is not a plain "this file does not exist on that side" (fail closed).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseChangeset } from "../../scripts/root-changelog.mjs";

const PACKAGE_FILE = /^packages\/([^/]+)\/(.+)$/;
const CHANGESET = /^\.changeset\/[^/]+\.md$/;
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[^/]+$/;
const NOT_SHIPPED = /^(README|CHANGELOG)[^/]*$|^docs\//i;
const BUILD_CONFIG =
  /^(vite\.config|vite\.shared|build\.config|svelte\.config|rollup\.config|tsup\.config)\.[^/]+$/;
const BUILD_SCRIPTS = ["prebuild", "build", "postbuild"];
const SCRIPT_PATH = /\.(m?[jt]s|c[jt]s|tsx?|json)$/;

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

const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];
// A plain version range as sync-peer-ranges.mjs and `changeset version` write it.
const RELEASE_RANGE = /^[~^]?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * True when two package.json texts differ only in what `changeset version`
 * writes: `version`, `devDependencies`, and a `@comvi/*` entry's plain version
 * range replaced by another (`^0.7.0` → `^0.8.0`). Adding or removing a
 * `@comvi/*` entry, an alias, URL, tag or non-string value, any other field or
 * key order still counts. A missing or unparsable side, or one without
 * `version`, → false.
 */
export function onlyReleaseVersionChanged(baseText, headText) {
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
  for (const manifest of [base, head]) {
    if (!Object.hasOwn(manifest, "version")) return false;
    delete manifest.version;
    delete manifest.devDependencies;
  }
  for (const field of DEPENDENCY_FIELDS) {
    if (!isObject(base[field]) || !isObject(head[field])) continue;
    for (const name of Object.keys(base[field])) {
      const from = base[field][name];
      const to = head[field][name];
      if (
        name.startsWith("@comvi/") &&
        Object.hasOwn(head[field], name) &&
        typeof from === "string" &&
        typeof to === "string" &&
        RELEASE_RANGE.test(from) &&
        RELEASE_RANGE.test(to)
      ) {
        base[field][name] = to;
      }
    }
  }
  return JSON.stringify(base) === JSON.stringify(head);
}

/** A diff whose every changeset entry is a deletion, at least one: the release PR's version commit. */
export function consumesChangesets(entries) {
  const changesets = entries.filter(
    ({ path: file }) => CHANGESET.test(file) && file !== ".changeset/README.md",
  );
  return changesets.length > 0 && changesets.every(({ status }) => status === "D");
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

/** A manifest text as an object, or `null` when it is missing or not one. */
function parseManifest(text) {
  if (text === null) return null;
  try {
    const manifest = JSON.parse(text);
    return isObject(manifest) ? manifest : null;
  } catch {
    return null;
  }
}

/** `./bin/x.js` → `bin/x.js`; `dist/` → `dist`. */
function packageRelative(target) {
  return path.posix.normalize(target).replace(/^\.\//, "").replace(/\/$/, "");
}

function stringLeaves(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (isObject(value)) return Object.values(value).flatMap(stringLeaves);
  return [];
}

/** Repo paths a package's build scripts name (`node ../../tooling/x.mjs`, `--config vite.config.dev.ts`). */
export function buildScriptPaths(dir, manifest) {
  const scripts = isObject(manifest?.scripts) ? manifest.scripts : {};
  return BUILD_SCRIPTS.flatMap((name) =>
    (typeof scripts[name] === "string" ? scripts[name] : "").split(/\s+/),
  )
    .filter((token) => token && !token.startsWith("-") && SCRIPT_PATH.test(token))
    .map((token) => path.posix.normalize(path.posix.join(dir, token)));
}

/**
 * Whether `rel` (a path inside the package, e.g. `bin/comvi.js`) is published
 * surface of a package whose manifest is `manifest` (`null`: unreadable).
 */
export function publishedPath(rel, manifest) {
  if (rel === "package.json") return true;
  if (TEST_PATH.test(rel)) return false;
  const files = Array.isArray(manifest?.files) ? manifest.files : null;
  // No `files`, or a glob this check does not expand: everything but tests and docs.
  if (!files || files.some((entry) => typeof entry !== "string" || /[*?[{!]/.test(entry))) {
    return !NOT_SHIPPED.test(rel);
  }

  const under = (entry) => {
    const root = packageRelative(entry);
    return rel === root || rel.startsWith(`${root}/`);
  };
  const targets = [
    ...files,
    ...stringLeaves(manifest.bin),
    ...stringLeaves(manifest.exports),
    ...[manifest.main, manifest.module, manifest.types, manifest.typings].filter(
      (value) => typeof value === "string",
    ),
  ];
  if (rel.startsWith("src/") || targets.some(under)) return true;
  if (BUILD_CONFIG.test(rel)) return true;
  return /^tsconfig(\.[^/]+)?\.json$/.test(rel) && !/test/i.test(rel);
}

/**
 * The published-surface paths among `files`.
 *
 * `read(side, file)` returns the file's text at "base" or "head", or `null`
 * when it does not exist there. `packageDirs` lists every `packages/<name>`
 * on either side, whose build scripts may name files outside packages/.
 * `releaseVersion`: the diff is a release version commit (`consumesChangesets`).
 */
export function publishedChanges(files, read, packageDirs = [], { releaseVersion = false } = {}) {
  const manifestOf = (dir) =>
    parseManifest(read("head", `${dir}/package.json`) ?? read("base", `${dir}/package.json`));
  const buildInputs = new Set(packageDirs.flatMap((dir) => buildScriptPaths(dir, manifestOf(dir))));
  return files.filter((file) => {
    if (TEST_PATH.test(file)) return false;
    if (buildInputs.has(file)) return true;
    const match = file.match(PACKAGE_FILE);
    if (!match) return false;
    const dir = `packages/${match[1]}`;
    if (match[2] === "package.json") {
      const base = read("base", file);
      const head = read("head", file);
      if (releaseVersion && onlyReleaseVersionChanged(base, head)) return false;
      return !onlyDevDependenciesChanged(base, head);
    }
    if (buildScriptPaths(dir, manifestOf(dir)).includes(file)) return true;
    return publishedPath(match[2], manifestOf(dir));
  });
}

/** The changesets this diff added or edited (they exist at HEAD). */
export function changesetChanges(entries) {
  return entries
    .filter(({ status, path: file }) => (status === "A" || status === "M") && CHANGESET.test(file))
    .filter(({ path: file }) => file !== ".changeset/README.md")
    .map(({ path: file }) => file);
}

/**
 * Splits changed changesets by whether they parse as one (a release entry and
 * a summary). `read(file)` returns the text at HEAD.
 */
export function validateChangesets(files, read) {
  const valid = [];
  const invalid = [];
  for (const file of files) {
    try {
      parseChangeset(read(file) ?? "", file);
      valid.push(file);
    } catch (error) {
      invalid.push({ file, reason: error.message });
    }
  }
  return { valid, invalid };
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
  for (const { status, path: file } of entries) console.log(`  ${status} ${file}`);

  const read = (side, file) => gitShow(side === "base" ? mergeBase : "HEAD", file);
  const packageDirs = [
    ...new Set(
      [mergeBase, "HEAD"].flatMap((rev) =>
        git(["ls-tree", "-z", "-d", "--name-only", rev, "packages/"]).split("\0").filter(Boolean),
      ),
    ),
  ];
  const releaseVersion = consumesChangesets(entries);
  if (releaseVersion) {
    console.log("Changesets consumed and none added: reading this as a release version commit.");
  }
  const published = publishedChanges(
    entries.map(({ path: file }) => file),
    read,
    packageDirs,
    { releaseVersion },
  );
  if (published.length === 0) {
    console.log("No change to what a published package ships. Skipping changeset check.");
    process.exit(0);
  }
  console.log("Published-surface changes detected:");
  for (const file of published) console.log(`  ${file}`);

  const { valid: changesets, invalid } = validateChangesets(changesetChanges(entries), (file) =>
    read("head", file),
  );
  for (const { reason } of invalid) console.log(`Not a valid changeset: ${reason}`);
  if (changesets.length === 0) {
    console.log("Published package changes detected but no valid changeset was added or edited.");
    console.log("Run 'pnpm changeset' and commit the generated .changeset/*.md file.");
    process.exit(1);
  }
  console.log("Changeset files detected:");
  for (const file of changesets) console.log(`  ${file}`);
}
