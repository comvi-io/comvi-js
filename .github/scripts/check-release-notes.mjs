/**
 * The hand-written notes of the version about to be released may hold no HTML
 * comment in their prose. One shown in a code block or a code span is content.
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
 * Every HTML comment in the PROSE of a Markdown text, as `{ start, end, line }`
 * (offsets into `text`, `end` exclusive, `line` 1-based). A comment inside a
 * fenced code block or an inline code span is the notes' own content — an
 * example — and is not listed.
 *
 * The rules are CommonMark's, as far as release notes need them:
 * - a fence opens on a line of three or more backticks or tildes, indented at
 *   most three spaces, with an optional info string (no backtick in a backtick
 *   fence's), and closes on a line of at least as many of the same character
 *   and nothing else; a fence never closed runs to the end of the text;
 * - a code span is a run of backticks up to the next run of the same length ON
 *   THE SAME LINE (a span broken across lines is read as prose);
 * - a comment that starts in prose runs to its `-->`, whatever is in between,
 *   fence markers included; one never closed runs to the end of the text.
 */
export function proseHtmlComments(text) {
  const comments = [];
  let fence = null;
  let line = 0;
  let at = 0;
  // Where the comment that is open ends: lines before it are inside it.
  let skipTo = 0;
  while (at < text.length) {
    const newline = text.indexOf("\n", at);
    const next = newline === -1 ? text.length : newline + 1;
    const content = text.slice(at, next).replace(/\r?\n$/, "");
    line += 1;
    let from = Math.max(at, skipTo);
    if (from >= next && skipTo > at) {
      at = next;
      continue;
    }
    if (from === at) {
      if (fence) {
        const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(content);
        if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
        at = next;
        continue;
      }
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
      if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
        fence = { char: open[1][0], length: open[1].length };
        at = next;
        continue;
      }
    }
    const end = at + content.length;
    while (from < end) {
      if (text[from] === "`") {
        let run = 1;
        while (text[from + run] === "`") run += 1;
        // The closing run: the same number of backticks, no more, on this line.
        let close = from + run;
        for (;;) {
          close = text.indexOf("`".repeat(run), close);
          if (close === -1 || close >= end) break;
          let length = run;
          while (text[close + length] === "`") length += 1;
          if (length === run) break;
          close += length;
        }
        from = close !== -1 && close < end ? close + run : from + run;
      } else if (text.startsWith("<!--", from)) {
        const close = text.indexOf("-->", from + 4);
        const stop = close === -1 ? text.length : close + 3;
        comments.push({ start: from, end: stop, line });
        skipTo = stop;
        from = stop;
      } else {
        from += 1;
      }
    }
    at = next;
  }
  return comments;
}

/** The 1-based line on which each prose HTML comment of `text` starts. */
export function htmlCommentLines(text) {
  return proseHtmlComments(text).map((comment) => comment.line);
}

/**
 * `text` without its prose HTML comments, everything else byte for byte. A
 * comment alone on its lines takes those lines with it; one inside a line
 * takes the spaces before it.
 */
export function stripHtmlComments(text) {
  let out = "";
  let at = 0;
  for (const { start, end } of proseHtmlComments(text)) {
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
      `::error file=${file},line=${line},title=Release notes hold an HTML comment::${file}:${line} has an HTML comment. ` +
        "The file is published as the GitHub Release body as it is: replace the comment with its text or delete it.",
    );
  }
  if (lines.length > 0) process.exit(1);
  console.log(`${file}: no HTML comment.`);
}
