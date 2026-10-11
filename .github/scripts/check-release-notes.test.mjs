/**
 * Which HTML comments in release notes are draft comments, and which are text.
 *
 * `htmlCommentLines` is what fails a release (check-release-notes.mjs, the
 * `pack` job) and `stripHtmlComments` is what create-combined-release.mjs
 * publishes when one got through. Both read the same ranges, so a comment the
 * check lets pass is one the release keeps, byte for byte: a comment shown in
 * a code block or a code span is the notes' content, not a leftover.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { htmlCommentLines, stripHtmlComments } from "./check-release-notes.mjs";

const CASES = [
  {
    name: "a comment in prose",
    text: "## Fixes\n\n- one\n<!-- slot -->\n- two\n",
    lines: [4],
    stripped: "## Fixes\n\n- one\n- two\n",
  },
  {
    name: "a comment at the end of a prose line",
    text: "- one <!-- slot -->\n- two\n",
    lines: [1],
    stripped: "- one\n- two\n",
  },
  {
    name: "a comment over several lines",
    text: "- one\n<!-- slot\n  still the slot -->\n- two\n",
    lines: [2],
    stripped: "- one\n- two\n",
  },
  {
    name: "a comment in a backtick fence with an info string",
    text: 'Write:\n\n```html title="index.html"\n<!-- example -->\n```\n',
    lines: [],
  },
  {
    name: "a comment in a tilde fence",
    text: "~~~\n<!-- example -->\n~~~\n",
    lines: [],
  },
  {
    name: "a comment in a longer fence that holds a shorter one",
    text: "````md\n```\n<!-- example -->\n```\n````\n",
    lines: [],
  },
  {
    name: "a comment in a fence indented three spaces",
    text: "- item\n\n   ```\n   <!-- example -->\n   ```\n",
    lines: [],
  },
  {
    name: "a comment in an inline code span",
    text: "Use `<!-- example -->` to mark it.\n",
    lines: [],
  },
  {
    name: "a comment in a double-backtick code span",
    text: "Use ``<!-- ` -->`` to mark it.\n",
    lines: [],
  },
  {
    name: "a comment after a closed fence",
    text: "```\ncode\n```\n<!-- slot -->\n",
    lines: [4],
    stripped: "```\ncode\n```\n",
  },
  {
    name: "a comment after a code span on the same line",
    text: "Run `x` now <!-- slot -->\n",
    lines: [1],
    stripped: "Run `x` now\n",
  },
  {
    name: "a fence opened and never closed: the rest of the file is code",
    text: "- one\n\n```\n<!-- example -->\nmore\n",
    lines: [],
  },
  {
    name: "a comment that starts in prose and contains a fence marker",
    text: "- one\n<!-- slot\n```\nstill the comment\n```\n-->\n- two\n",
    lines: [2],
    stripped: "- one\n- two\n",
  },
  {
    name: "a comment in prose that is never closed: it runs to the end",
    text: "- one\n<!-- slot\n- two\n",
    lines: [2],
    stripped: "- one\n",
  },
  {
    name: "four backticks with text after them on the line are not a fence",
    text: "a ```` b\n<!-- slot -->\n",
    lines: [2],
    stripped: "a ```` b\n",
  },
  {
    name: "CRLF: a comment in prose and one in a fence",
    text: "- one\r\n<!-- slot -->\r\n```\r\n<!-- example -->\r\n```\r\n- two\r\n",
    lines: [2],
    stripped: "- one\r\n```\r\n<!-- example -->\r\n```\r\n- two\r\n",
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
