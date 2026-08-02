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

/**
 * An insertion that appends `names` to a `{ a, b }` list — an import clause or
 * an object pattern — landing right after the last member so the result reads
 * `{ a, b, c }` and not `{ a, b , c }`.
 */
export function braceListInsertion(node, names) {
  const members = node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  const joined = names.join(", ");
  if (members.length === 0) {
    const start = node.range().start.index + 1;
    return { start, end: start, text: ` ${joined} ` };
  }
  const start = members[members.length - 1].range().end.index;
  return { start, end: start, text: `, ${joined}` };
}
