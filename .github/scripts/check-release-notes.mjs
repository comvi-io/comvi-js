/**
 * The hand-written notes of the version about to be released may hold no HTML
 * comment.
 *
 * `.github/release-notes/<version>.md` goes into the GitHub Release body as it
 * is (create-combined-release.mjs), and a re-run only re-uploads the asset, so
 * a comment left in the file — a draft marker, a "bullet goes here" slot — is
 * published and stays. The version is `@comvi/core`'s, the release train's: on
 * a branch with pending changesets that is the last release, on the release
 * commit it is the one going out.
 *
 *   node .github/scripts/check-release-notes.mjs [version]
 *
 * Exit 1 with one `::error file=…,line=…::` per comment; exit 0 when the file
 * is clean or the version has no hand-written notes.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The 1-based line of every `<!--` in `text`. */
export function htmlCommentLines(text) {
  return text.split("\n").flatMap((line, index) => (line.includes("<!--") ? [index + 1] : []));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version =
    process.argv[2] ?? JSON.parse(readFileSync("packages/core/package.json", "utf8")).version;
  const file = `.github/release-notes/${version}.md`;
  let notes = null;
  try {
    notes = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (notes === null) {
    console.log(`${file}: no hand-written notes for ${version}.`);
    process.exit(0);
  }
  const lines = htmlCommentLines(notes);
  for (const line of lines) {
    console.log(
      `::error file=${file},line=${line},title=Release notes hold an HTML comment::${file}:${line} has an HTML comment. ` +
        "The file is published as the GitHub Release body as it is: replace the comment with its text or delete it.",
    );
  }
  if (lines.length > 0) process.exit(1);
  console.log(`${file}: no HTML comment.`);
}
