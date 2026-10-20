/**
 * The hand-written notes of the version about to be released may hold no HTML
 * comment, anywhere: any `<!--` fails. To show one, the notes write `&lt;!--`
 * in a `<pre><code>` block (a Markdown fence or code span prints the entity as
 * it is).
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

/**
 * Every HTML comment in `text`, as `{ start, end, line }` (offsets into `text`,
 * `end` exclusive, `line` 1-based): each `<!--` up to its `-->`, or to the end
 * of the text when it is never closed.
 *
 * Wherever it is. Markdown is deliberately not read: telling a comment in a
 * code sample from a draft comment means parsing fences, list items and code
 * spans as GitHub does, and every case such a reading gets wrong is a draft
 * comment that passes the gate. The rule that cannot be fooled is the literal
 * one; the price is that notes cannot show `<!--` as it is, and write
 * `&lt;!--` inside `<pre><code>` instead.
 */
export function htmlComments(text) {
  const comments = [];
  let line = 1;
  let counted = 0;
  for (let start = text.indexOf("<!--"); start !== -1; ) {
    const close = text.indexOf("-->", start + 4);
    const end = close === -1 ? text.length : close + 3;
    for (; counted < start; counted += 1) if (text[counted] === "\n") line += 1;
    comments.push({ start, end, line });
    start = text.indexOf("<!--", end);
  }
  return comments;
}

/** The 1-based line on which each HTML comment of `text` starts. */
export function htmlCommentLines(text) {
  return htmlComments(text).map((comment) => comment.line);
}

/**
 * `text` without its HTML comments, everything else byte for byte. A comment
 * alone on its lines takes those lines with it; one inside a line takes the
 * spaces before it.
 */
export function stripHtmlComments(text) {
  let out = "";
  let at = 0;
  for (const { start, end } of htmlComments(text)) {
    let from = start;
    while (from > at && (text[from - 1] === " " || text[from - 1] === "\t")) from -= 1;
    let to = end;
    while (text[to] === " " || text[to] === "\t") to += 1;
    const ownLines = (from === 0 || text[from - 1] === "\n") && /^(\r?\n|$)/.test(text.slice(to));
    if (ownLines) to += /^\r?\n/.exec(text.slice(to))?.[0].length ?? 0;
    else to = end;
    out += text.slice(at, from);
    at = to;
  }
  return out + text.slice(at);
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
      `::error file=${file},line=${line},title=Release notes hold an HTML comment::${file}:${line}: ` +
        "release notes must not contain an HTML comment; to show one in a code sample write `&lt;!--` " +
        "inside <pre><code> (a Markdown fence prints the entity as it is). " +
        "The file is published as the GitHub Release body as it is.",
    );
  }
  if (lines.length > 0) process.exit(1);
  console.log(`${file}: no HTML comment.`);
}
