/**
 * Text-splice utilities: `.vue` / `.svelte` script-block extraction with
 * position remap, plus the primitives every rule emits edits through.
 *
 * Positions matter twice over — the report is sorted by `path:line` and must
 * name the line in the ORIGINAL SFC, not in the extracted body — so every
 * block carries the absolute offset and the line it starts on.
 */

const SCRIPT_OPEN = /<script(\s[^>]*)?>/gi;

/**
 * @returns {{ blocks: Array<{ body: string, offset: number, line: number, lang: "ts" | "js" }>,
 *             failures: Array<{ line: number, column: number, detail: string }> }}
 */
export function extractScriptBlocks(text) {
  const blocks = [];
  const failures = [];

  SCRIPT_OPEN.lastIndex = 0;
  let open;
  while ((open = SCRIPT_OPEN.exec(text)) !== null) {
    const bodyStart = open.index + open[0].length;
    const close = text.indexOf("</script>", bodyStart);
    if (close === -1) {
      const { line, column } = positionAt(text, open.index);
      failures.push({
        line,
        column,
        detail: `<script> block opened at line ${line} is never closed — extraction impossible`,
      });
      break;
    }
    const attrs = open[1] ?? "";
    blocks.push({
      body: text.slice(bodyStart, close),
      offset: bodyStart,
      line: positionAt(text, bodyStart).line,
      lang: /lang\s*=\s*["']?ts["']?/i.test(attrs) ? "ts" : "js",
    });
    SCRIPT_OPEN.lastIndex = close + "</script>".length;
  }

  return { blocks, failures };
}

/** 1-based line / 1-based column of a character offset. */
export function positionAt(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Applies non-overlapping `{ start, end, text }` splices, last one first. */
export function applyEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const edit of ordered) {
    if (edit.end > previousStart) {
      throw new Error(
        `codemod produced overlapping edits at ${edit.start}..${edit.end} (previous started at ${previousStart})`,
      );
    }
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    previousStart = edit.start;
  }
  return out;
}

/** The members of a `{ a, b }` list, in source order, comments excluded. */
export function braceListMembers(node) {
  return node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
}

/**
 * An insertion that appends `names` to a `{ a, b }` list — an import clause,
 * an object pattern or an object literal — landing right after the last member
 * so the result reads `{ a, b, c }` and not `{ a, b , c }`.
 *
 * A list the author BROKE over lines gets one more line, at the indent its last
 * member uses (and the trailing comma the source already had stays trailing).
 * A one-liner stays a one-liner. The point is that a migrated call still looks
 * like the code around it before any formatter runs.
 *
 * `skip` names members a REMOVAL in the same plan is about to delete: anchoring
 * on one of those would put the insertion inside the deleted span, and
 * `applyEdits` rejects overlapping edits.
 */
export function braceListInsertion(node, names, skip = () => false) {
  const members = braceListMembers(node).filter((member) => !skip(member));
  const joined = names.join(", ");
  if (members.length === 0) {
    const start = node.range().start.index + 1;
    return { start, end: start, text: ` ${joined} ` };
  }
  const last = members[members.length - 1];
  const start = last.range().end.index;
  const body = node.text();
  const lineStart = body.lastIndexOf("\n", last.range().start.index - node.range().start.index);
  if (lineStart === -1) return { start, end: start, text: `, ${joined}` };
  const indent = /^[ \t]*/.exec(body.slice(lineStart + 1))[0];
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  return { start, end: start, text: `,${eol}${indent}${joined}` };
}

/**
 * Deletions that drop the members `doomed` selects from a `{ a, b, c }` list,
 * leaving every separator of the members that stay exactly as it was.
 *
 * CONSECUTIVE removals are one splice on purpose: two independent ones would
 * both claim the comma between them, and `applyEdits` rejects that overlap.
 * A run keeps the separator on the side of the member it merges into — the
 * trailing comma of a multi-line object literal survives, so the result reads
 * like the source did.
 */
export function braceListRemoval(node, doomed) {
  const members = braceListMembers(node);
  const cut = members
    .map((member, index) => (doomed(member, index) ? index : -1))
    .filter((index) => index !== -1);
  if (cut.length === 0) return [];

  const edits = [];
  for (let at = 0; at < cut.length; ) {
    let last = at;
    while (last + 1 < cut.length && cut[last + 1] === cut[last] + 1) last += 1;
    const first = cut[at];
    const following = members[cut[last] + 1];
    const preceding = first === 0 ? undefined : members[first - 1];
    if (following !== undefined) {
      // A member stays after the run: take the run and the comma behind it.
      edits.push({
        start: members[first].range().start.index,
        end: following.range().start.index,
        text: "",
      });
    } else if (preceding !== undefined) {
      // The run ends the list: take the comma in FRONT of it instead.
      edits.push({
        start: preceding.range().end.index,
        end: members[cut[last]].range().end.index,
        text: "",
      });
    } else {
      // Nothing stays: empty the braces.
      edits.push({
        start: node.range().start.index + 1,
        end: node.range().end.index - 1,
        text: "",
      });
    }
    at = last + 1;
  }
  return edits;
}
