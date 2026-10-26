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

export function detectJsonStyle(text: string | null): JsonStyle {
  if (text === null || text.trim() === "") return {};
  const style: JsonStyle = {};

  // A file on one line shows neither its line ending nor its final newline.
  const lineBreak = /\r?\n/.exec(text);
  if (lineBreak) {
    style.eol = lineBreak[0] === "\r\n" ? "\r\n" : "\n";
    style.finalNewline = /\n$/.test(text);
  }

  // Only after "\n": `^` with the m flag also matches after U+2028, which a string may hold raw.
  const indent = /\n([ \t]+)\S/.exec(text)?.[1];
  if (indent && /^(\t+| +)$/.test(indent)) {
    style.indent = indent;
  }
  return style;
}

export function isCompleteJsonStyle(style: JsonStyle): boolean {
  return style.indent !== undefined && style.eol !== undefined && style.finalNewline !== undefined;
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
  // Strings hold "\n" and "\t" only escaped, so these are line ends and indentation;
  // tabs first, because JSON.stringify cuts an indent to ten characters.
  const body = JSON.stringify(value, null, "\t").replace(
    /\n(\t*)/g,
    (_, tabs: string) => style.eol + style.indent.repeat(tabs.length),
  );
  return style.finalNewline ? body + style.eol : body;
}
