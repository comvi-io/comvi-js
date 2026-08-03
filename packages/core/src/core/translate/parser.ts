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

/**
 * DEV-ONLY (plan §2.3): the ambient-tag loudness residual.
 *
 * Tag syntax through the string API (`t("click <b>here</b>")`) is literal text
 * when no extension claims `<`, and it stays literal in production — unlike an
 * ICU plural, a literal `<b>` is visibly broken in any UI review, so the
 * loudness bar is met by a development warning plus that visibility rather
 * than by a throw. This is the named, owned decision, not an oversight.
 *
 * Once per template, and only for genuinely tag-like input (`<` followed by an
 * ASCII letter): a bare `<` in "a < b" is arithmetic, not markup. The whole
 * mechanism is behind `IS_DEV`, so production pays 0 B — the same fold
 * `warnIfNotFlat` uses.
 */
const warnedTagTemplates = IS_DEV ? new Set<string>() : undefined;

function warnUnclaimedTag(template: string, index: number, len: number): void {
  const next = index + 1 < len ? template.charCodeAt(index + 1) : 0;
  const isLetter = (next >= 65 && next <= 90) || (next >= 97 && next <= 122);
  if (!isLetter || warnedTagTemplates === undefined || warnedTagTemplates.has(template)) return;
  warnedTagTemplates.add(template);
  warn(
    `[i18n] Tag syntax in "${template}" is rendering as literal text: no tag ` +
      `extension claims "<". Render it with your framework's <T> component, or ` +
      `import "@comvi/core/tags" to register tag syntax for the string API.`,
  );
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
 * `#` as syntax — the detection code stays out of the base graph.
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
 * function never reads the module-global registry.
 *
 * The core grammar owns `{...}` arguments and ICU `'` quoting. `<`, `&` and
 * `\` are EXTENSION territory: the scanner offers each of them to the
 * effective extension set and, when nothing claims the position, lets the
 * character flow through as literal text. The tag extension
 * (`@comvi/core/tags`) is what claims all three today — `<tag>…</tag>`, the
 * `&lt;` / `&gt;` / `&amp;` entities and the `\<` escape are one grammar and
 * they cost nothing in a graph that has no tags.
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
    } else if (!isQuoted && (code === LESS_THAN || code === AMPERSAND || code === BACKSLASH)) {
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
        // No extension claims the position — the character is literal text.
        // Tag-like input gets one development warning per template (§2.3); a
        // real tags extension never reaches here, because it claimed the `<`.
        if (IS_DEV && code === LESS_THAN) warnUnclaimedTag(template, i, len);
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
