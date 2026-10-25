/**
 * Which changed files reach a published artifact, for the changeset guard in
 * ci.yml: `packages/<name>/src/**` and `packages/<name>/package.json`, except a
 * package.json whose only change is `devDependencies`. devDependencies never
 * reach a consumer, and a Dependabot PR that bumps only them would otherwise
 * need a hand-written changeset. Any other manifest change (dependencies,
 * peerDependencies, optionalDependencies, exports, version, ...) still counts,
 * and so does a manifest added or deleted.
 *
 *   node .github/scripts/published-changes.mjs <base-ref>
 *
 * Prints one published-surface path per line (nothing when there is none),
 * compared as `git diff <base-ref>...HEAD`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SURFACE = /^packages\/[^/]+\/(src\/|package\.json$)/;
const MANIFEST = /^packages\/[^/]+\/package\.json$/;

/**
 * True when two package.json texts differ in `devDependencies` alone. A missing
 * side (`null`: the file was added or deleted) or a text that does not parse is
 * never devDependencies-only.
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
  delete base.devDependencies;
  delete head.devDependencies;
  return isDeepStrictEqual(base, head);
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

function gitShow(rev, file) {
  try {
    return execFileSync("git", ["show", `${rev}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("usage: node .github/scripts/published-changes.mjs <base-ref>");
    process.exit(2);
  }
  const mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
    encoding: "utf8",
  }).trim();
  const files = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const changes = publishedChanges(files, (side, file) =>
    gitShow(side === "base" ? mergeBase : "HEAD", file),
  );
  if (changes.length > 0) console.log(changes.join("\n"));
}
