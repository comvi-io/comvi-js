/**
 * How a catalog file is laid out, so a write keeps a formatter's check green.
 * Each field is `undefined` when the text does not show it: a file on one
 * line shows no indentation, line ending or final newline.
 */
export interface JsonStyle {
  indent?: string;
  eol?: "\n" | "\r\n";
  finalNewline?: boolean;
}

export const DEFAULT_JSON_STYLE: Required<JsonStyle> = {
  indent: "  ",
  eol: "\n",
  finalNewline: true,
};

/** `JSON.stringify` takes at most ten characters of indentation. */
const MAX_INDENT = 10;

export function detectJsonStyle(text: string | null): JsonStyle {
  if (text === null || text.trim() === "") return {};
  const style: JsonStyle = {};

  // A file on one line shows neither its line ending nor its final newline.
  const lineBreak = /\r?\n/.exec(text);
  if (lineBreak) {
    style.eol = lineBreak[0] === "\r\n" ? "\r\n" : "\n";
    style.finalNewline = /\n$/.test(text);
  }

  const indent = /^([ \t]+)\S/m.exec(text)?.[1];
  if (indent && indent.length <= MAX_INDENT && /^(\t+| +)$/.test(indent)) {
    style.indent = indent;
  }
  return style;
}

/** The first style that shows each field wins, then the default. */
export function resolveJsonStyle(...styles: JsonStyle[]): Required<JsonStyle> {
  return {
    indent: styles.find((s) => s.indent !== undefined)?.indent ?? DEFAULT_JSON_STYLE.indent,
    eol: styles.find((s) => s.eol !== undefined)?.eol ?? DEFAULT_JSON_STYLE.eol,
    finalNewline:
      styles.find((s) => s.finalNewline !== undefined)?.finalNewline ??
      DEFAULT_JSON_STYLE.finalNewline,
  };
}

export function stringifyJson(value: unknown, style: Required<JsonStyle>): string {
  // Line breaks inside strings are escaped, so every "\n" here is a line end.
  const body = JSON.stringify(value, null, style.indent).replace(/\n/g, style.eol);
  return style.finalNewline ? body + style.eol : body;
}
