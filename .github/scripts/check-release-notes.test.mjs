/**
 * What in release notes is an HTML comment: every `<!--`, wherever it is.
 *
 * `htmlCommentLines` is what fails a release (check-release-notes.mjs, the
 * `pack` job) and `stripHtmlComments` is what create-combined-release.mjs
 * publishes when one got through; both read the same ranges. Markdown is not
 * read on purpose: the first block of cases are draft comments that a reading
 * of fences, list items and code spans let through.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { htmlCommentLines, stripHtmlComments } from "./check-release-notes.mjs";

const CASES = [
  // Draft comments in prose that a Markdown-aware reading took for code.
  {
    name: "a comment between escaped backticks",
    text: "a \\` <!-- draft --> \\` b\n",
    lines: [1],
    stripped: "a \\` \\` b\n",
  },
  {
    name: "a comment after a code span that spans a line break",
    text: "Use ` to quote\nand ` <!-- draft --> ` here\n",
    lines: [2],
    stripped: "Use ` to quote\nand ` ` here\n",
  },
  {
    name: "a comment after a list-item fence closed at five spaces",
    text: "- item\n  ```diff\n  -a\n     ```\n<!-- draft -->\n",
    lines: [5],
    stripped: "- item\n  ```diff\n  -a\n     ```\n",
  },
  {
    name: "a comment after a fence that ends with its list item",
    text: "- item\n  ```\n  code\n<!-- draft -->\n",
    lines: [4],
    stripped: "- item\n  ```\n  code\n",
  },
  {
    name: "a comment after a backtick fence that opens on the list marker's line",
    text: "- ```html\n  <div>example</div>\n  ```\n\n<!-- DRAFT -->\n",
    lines: [5],
    stripped: "- ```html\n  <div>example</div>\n  ```\n\n",
  },
  {
    name: "a comment after a tilde fence that opens on the list marker's line",
    text: "- ~~~html\n  <div>example</div>\n  ~~~\n\n<!-- DRAFT -->\n",
    lines: [5],
    stripped: "- ~~~html\n  <div>example</div>\n  ~~~\n\n",
  },
  // A comment in a code sample is a comment too: the notes write `&lt;!--`.
  {
    name: "a comment inside a fenced code block",
    text: "Write:\n\n```html\n<!-- example -->\n```\n",
    lines: [4],
    stripped: "Write:\n\n```html\n```\n",
  },
  {
    name: "a comment inside an inline code span",
    text: "Use `<!-- example -->` to mark it.\n",
    lines: [1],
    stripped: "Use `` to mark it.\n",
  },
  {
    name: "the entity form, in prose and in a pre block",
    text: "Use &lt;!-- example --&gt;.\n\n<pre><code>&lt;!-- example --&gt;</code></pre>\n",
    lines: [],
  },
  {
    name: "a comment alone on its line",
    text: "## Fixes\n\n- one\n<!-- slot -->\n- two\n",
    lines: [4],
    stripped: "## Fixes\n\n- one\n- two\n",
  },
  {
    name: "a comment at the end of a line",
    text: "- one <!-- slot -->\n- two\n",
    lines: [1],
    stripped: "- one\n- two\n",
  },
  {
    name: "a comment over several lines, and a second one after it",
    text: "- one\n<!-- slot\n  still the slot -->\n- two <!-- b -->\n",
    lines: [2, 4],
    stripped: "- one\n- two\n",
  },
  {
    name: "a comment that is never closed: it runs to the end",
    text: "- one\n<!-- slot\n- two\n",
    lines: [2],
    stripped: "- one\n",
  },
  {
    name: "CRLF line endings",
    text: "- one\r\n<!-- slot -->\r\n- two <!-- b -->\r\n",
    lines: [2, 3],
    stripped: "- one\r\n- two\r\n",
  },
  {
    name: "no comment",
    text: "## Fixes\n\n- one --> two <! three\n",
    lines: [],
  },
];

for (const { name, text, lines, stripped = text } of CASES) {
  test(`${name} → lines ${JSON.stringify(lines)}`, () => {
    assert.deepEqual(htmlCommentLines(text), lines);
  });

  test(`${name} → ${stripped === text ? "kept byte for byte" : "cut, the rest unchanged"}`, () => {
    assert.equal(stripHtmlComments(text), stripped);
  });
}
