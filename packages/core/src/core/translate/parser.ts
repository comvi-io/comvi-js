import { warn } from "../../logger";
import { TK_TEXT, type ParsedToken } from "./cache";
import type { MessageCompiler, SyntaxExtension } from "./syntax";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const APOSTROPHE = 39;
const BACKSLASH = 92;
const AMPERSAND = 38;
const OPEN_BRACE = 123;
const CLOSE_BRACE = 125;
const LESS_THAN = 60;
const HASH = 35;

/**
 * ICU DOUBLE_OPTIONAL quoting (same as ICU4J, FormatJS, i18next, Tolgee):
 * an apostrophe starts quoted literal text only when it immediately precedes
 * a syntax character. Everywhere else it is literal text, so real-world
 * content like "Superiors' behavior" or a trailing "l'" survives.
 * '' always collapses to a literal apostrophe.
 *
 * `{` and `}` are syntax everywhere; `#` is syntax only inside a
 * plural/selectordinal sub-message (hashIsSyntax), including select
 * sub-messages nested in one. At the top level and in standalone selects
 * `'#'` stays two literal characters.
 */
function isQuoteStart(str: string, index: number, len: number, hashIsSyntax: boolean): boolean {
  if (index + 1 >= len) return false;
  const nextCode = str.charCodeAt(index + 1);
  if (nextCode === OPEN_BRACE || nextCode === CLOSE_BRACE) return true;
  return hashIsSyntax && nextCode === HASH;
}

/** Skip a quoted section, returns index after closing quote */
function skipQuotedSection(str: string, startIndex: number, len: number): number {
  let i = startIndex + 1;
  while (i < len) {
    const code = str.charCodeAt(i);
    if (code === APOSTROPHE) {
      if (i + 1 < len && str.charCodeAt(i + 1) === APOSTROPHE) {
        i += 2;
      } else {
        return i + 1;
      }
    } else {
      i++;
    }
  }
  return i;
}

export function advancePastApostrophe(
  str: string,
  index: number,
  len: number,
  hashIsSyntax: boolean,
): number {
  if (index + 1 < len && str.charCodeAt(index + 1) === APOSTROPHE) {
    return index + 2;
  }
  if (isQuoteStart(str, index, len, hashIsSyntax)) {
    return skipQuotedSection(str, index, len);
  }
  return index + 1;
}

/**
 * Signature of `MessageCompiler.argOpensHashScope`: whether the `{` at
 * braceIndex starts an argument that rebinds `#` (ICU plural/selectordinal).
 * Compilers without such syntax leave it unset and the parser never treats
 * `#` as syntax — the detection code stays out of the slim graph.
 */
export type ArgOpensHashScope = (str: string, braceIndex: number, len: number) => boolean;

export function findMatchingBraceEnd(
  str: string,
  startIndex: number,
  len: number,
  hashIsSyntax: boolean,
  opensHashScope?: ArgOpensHashScope,
): number {
  let braceCount = 1;
  let i = startIndex;
  let context = hashIsSyntax;
  const contextStack: boolean[] = [];

  while (i < len && braceCount > 0) {
    const code = str.charCodeAt(i);

    if (code === APOSTROPHE) {
      i = advancePastApostrophe(str, i, len, context);
      continue;
    }

    if (code === OPEN_BRACE) {
      braceCount++;
      contextStack.push(context);
      if (!context && opensHashScope !== undefined && opensHashScope(str, i, len)) context = true;
    } else if (code === CLOSE_BRACE) {
      braceCount--;
      if (contextStack.length > 0) context = contextStack.pop()!;
    }
    i++;
  }

  return braceCount === 0 ? i : -1;
}

/**
 * Parse a template into tokens.
 *
 * `extensions` is the EFFECTIVE syntax-extension set (ambient ∪ per-call),
 * computed once per translate call by the pipeline and threaded down — this
 * function never reads the module-global registry. When no extension claims
 * a `<`, the character flows through as literal text.
 *
 * `compiler` decides what a balanced `{...}` argument compiles to.
 */
export function parseTemplate(
  template: string,
  hashIsSyntax: boolean,
  extensions: readonly SyntaxExtension[],
  compiler: MessageCompiler,
): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  const len = template.length;
  let lastIndex = 0;
  let isQuoted = false;
  let i = 0;

  while (i < len) {
    const code = template.charCodeAt(i);

    if (code === APOSTROPHE) {
      if (i + 1 < len && template.charCodeAt(i + 1) === APOSTROPHE) {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        tokens.push([TK_TEXT, "'"]);
        i += 2;
        lastIndex = i;
      } else if (isQuoted || isQuoteStart(template, i, len, hashIsSyntax)) {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        isQuoted = !isQuoted;
        i++;
        lastIndex = i;
      } else {
        i++;
      }
    } else if (code === AMPERSAND && !isQuoted) {
      let entityLength = 0;
      let entityChar = "";
      if (template.slice(i, i + 4) === "&lt;") {
        entityLength = 4;
        entityChar = "<";
      } else if (template.slice(i, i + 4) === "&gt;") {
        entityLength = 4;
        entityChar = ">";
      } else if (template.slice(i, i + 5) === "&amp;") {
        entityLength = 5;
        entityChar = "&";
      }
      if (entityLength !== 0) {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        tokens.push([TK_TEXT, entityChar]);
        i += entityLength;
        lastIndex = i;
        continue;
      }
      i++;
    } else if (
      code === BACKSLASH &&
      !isQuoted &&
      i + 1 < len &&
      template.charCodeAt(i + 1) === LESS_THAN
    ) {
      if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
      tokens.push([TK_TEXT, "<"]);
      i += 2;
      lastIndex = i;
    } else if (code === LESS_THAN && !isQuoted) {
      let hookResult: { token: ParsedToken; endIndex: number } | undefined;
      for (let e = 0; e < extensions.length; e++) {
        hookResult = extensions[e].parseHook(template, i, len, hashIsSyntax, extensions, compiler);
        if (hookResult !== undefined) break;
      }
      if (hookResult !== undefined) {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        tokens.push(hookResult.token);
        i = hookResult.endIndex;
        lastIndex = i;
      } else {
        // No extension claims '<' — it flows through as literal text.
        i++;
      }
    } else if (code === OPEN_BRACE && !isQuoted) {
      if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
      const tokenResult = extractToken(template, i, hashIsSyntax, compiler);
      if (tokenResult.token) {
        tokens.push(tokenResult.token);
      } else {
        tokens.push([TK_TEXT, template.slice(i, tokenResult.endIndex)]);
      }
      i = tokenResult.endIndex;
      lastIndex = i;
      if (tokenResult.shouldBreak) break;
    } else {
      i++;
    }
  }

  if (lastIndex < len) tokens.push([TK_TEXT, template.slice(lastIndex)]);
  return tokens;
}

export function extractToken(
  segment: string,
  startIndex: number,
  hashIsSyntax: boolean,
  compiler: MessageCompiler,
): { token?: ParsedToken; endIndex: number; shouldBreak: boolean } {
  const len = segment.length;
  const opensHashScope = compiler.argOpensHashScope;
  const contentHashIsSyntax =
    hashIsSyntax || (opensHashScope !== undefined && opensHashScope(segment, startIndex, len));
  const endIndex = findMatchingBraceEnd(
    segment,
    startIndex + 1,
    len,
    contentHashIsSyntax,
    opensHashScope,
  );

  if (endIndex === -1) {
    if (IS_DEV) {
      warn("[i18n] Unbalanced braces in template");
    }
    return { endIndex: len, shouldBreak: true };
  }

  const tokenContent = segment.slice(startIndex + 1, endIndex - 1);
  return {
    token: compiler.makeArgToken(tokenContent, contentHashIsSyntax, segment),
    endIndex,
    shouldBreak: false,
  };
}
