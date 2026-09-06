// The ONE place that reads module specifiers out of a `.d.ts`.
//
// Both layers of the node16 defence import this: tooling/qualify-dts-specifiers.mjs
// (which rewrites specifiers at build time) and scripts/check-types-exports.mjs
// (which fails the build when one is unresolvable). They previously carried
// byte-identical copies of a comment-blanking regex pair, and that copy was wrong
// in the same way twice: it treated `//` INSIDE A STRING LITERAL as the start of a
// line comment, so a single declaration like
//
//     export declare const CDN: "https://cdn.example.com/x";
//     export type Later = import("./later");
//
// blanked everything from `//cdn.example.com…` to the end of the line — and with
// it the real specifier on the next line. The rewriter then made 0 rewrites, the
// gate found 0 specifiers, and both reported green while an unresolvable specifier
// shipped. Two copies meant a fix could be applied to one and not the other.
//
// So this scanner walks the text ONCE, character by character, and knows the
// difference between code, comments, and string/template literals. A specifier is
// a string literal in an import/export position — never a substring of anything
// else.

const IMPORT_POSITION = /(?:\bfrom|\bimport)\s*$/;
const DYNAMIC_IMPORT_POSITION = /\bimport\s*\(\s*$/;
const STAR_REEXPORT_POSITION = /\bexport\s+(?:type\s+)?\*\s+(?:as\s+[A-Za-z_$][\w$]*\s+)?from\s*$/;

/**
 * One pass over a declaration file.
 *
 * Returns the `'…'`/`"…"` literals it found (`start` = opening quote, `end` = one
 * past the closing quote) together with `code`: a same-length copy of the text in
 * which every comment and every literal has become spaces, so the text PRECEDING
 * a literal can be inspected without a comment or an earlier string faking an
 * import position.
 */
function scan(text) {
  const length = text.length;
  const chars = [...text];
  const tokens = [];
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to && k < length; k += 1) {
      if (chars[k] !== "\n") chars[k] = " ";
    }
  };

  // Template literals never hold a module specifier, but their `${ … }`
  // substitutions can hold quotes, comments and further templates — so they are
  // skipped whole rather than scanned.
  const skipTemplate = () => {
    const start = i;
    i += 1;
    while (i < length) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === "`") {
        i += 1;
        break;
      } else if (c === "$" && text[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < length && depth > 0) {
          const inner = text[i];
          if (inner === "{") {
            depth += 1;
            i += 1;
          } else if (inner === "}") {
            depth -= 1;
            i += 1;
          } else if (inner === "`") skipTemplate();
          else if (inner === "'" || inner === '"') skipQuoted(inner);
          else i += 1;
        }
      } else i += 1;
    }
    blank(start, i);
  };

  const skipQuoted = (quote) => {
    const start = i;
    i += 1;
    while (i < length) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === quote) {
        i += 1;
        break;
      } else if (c === "\n")
        break; // unterminated — never run past the line
      else i += 1;
    }
    const token = { start, end: i, value: text.slice(start + 1, Math.max(start + 1, i - 1)) };
    blank(start, i);
    return token;
  };

  while (i < length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      const start = i;
      while (i < length && text[i] !== "\n") i += 1;
      blank(start, i);
    } else if (c === "/" && text[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, length);
      blank(start, i);
    } else if (c === "`") {
      skipTemplate();
    } else if (c === "'" || c === '"') {
      tokens.push(skipQuoted(c));
    } else {
      i += 1;
    }
  }

  return { tokens, code: chars.join("") };
}

/**
 * Every module specifier in a declaration file.
 *
 * `kind` is `"star"` when the specifier belongs to an `export * from …` (an
 * unresolved one contributes NO names, so the entry point loses every export and
 * the consumer gets TS2305) and `"named"` otherwise (an unresolved one keeps the
 * name but silently degrades it to `any`).
 *
 * `valueStart`/`valueEnd` bound the specifier text itself — not its quotes — in
 * the ORIGINAL string, so a caller can splice a replacement in.
 *
 * `declare module "…"` augmentations are deliberately NOT reported: rewriting an
 * augmentation target changes what it augments. There are none in this repo's
 * output today; if that changes, the gate's report is where it will surface.
 * `/// <reference path="…" />` is likewise out of scope — a triple-slash path is
 * not a module specifier and node16's ESM rules do not apply to it. There are
 * none in the emitted output today.
 */
export function moduleSpecifiers(text) {
  const { tokens, code } = scan(text);
  const found = [];

  for (const token of tokens) {
    const before = code.slice(0, token.start);
    if (!IMPORT_POSITION.test(before) && !DYNAMIC_IMPORT_POSITION.test(before)) continue;
    found.push({
      specifier: token.value,
      kind: STAR_REEXPORT_POSITION.test(before) ? "star" : "named",
      valueStart: token.start + 1,
      valueEnd: token.end - 1,
    });
  }
  return found;
}
