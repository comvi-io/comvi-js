import { warn } from "../../logger";
import { TK_HASH, TK_TEXT, type ParsedToken } from "./cache";
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
 * Tag syntax through the string API (`t("click <b>here</b>")`) is literal text
 * when no extension claims `<`, and it stays literal in production: unlike an
 * ICU plural, a literal `<b>` is visibly broken in any UI review, so a dev
 * warning plus that visibility is deliberately chosen over a throw.
 *
 * Once per template, and only for genuinely tag-like input (`<` followed by an
 * ASCII letter) — the bare `<` in "a < b" is arithmetic, not markup. Behind
 * `IS_DEV`, so production pays nothing.
 */
const warnedTagTemplates = IS_DEV ? new Set<string>() : undefined;

/** @internal Test teardown: forgets which templates already raised the unclaimed-tag warning. */
export function _resetTagWarnings(): void {
  warnedTagTemplates?.clear();
}

/** `id` of the built-in tag extension (`@comvi/core/tags`). DEV diagnostics only. */
const TAGS_EXTENSION_ID = "comvi:tags";

/**
 * True when `<` opens something the tag extension WOULD recognise but refuses
 * because it carries attributes — mirrors `tags.ts#parseTag`, which accepts
 * only `>` or `/>` after the tag name.
 */
function refusedForAttributes(str: string, index: number, len: number): boolean {
  let i = index + 1;
  // Both scans also stop on their own — `charCodeAt` past the end is NaN, which
  // fails every comparison below — but the `i < len` bounds stay: a scan that
  // can only terminate on NaN becomes an infinite loop the moment its predicate
  // is wrong, and this runs inside `t()`.
  for (; i < len; i++) {
    const c = str.charCodeAt(i);
    const isNameChar =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45 || c === 95;
    if (!isNameChar) break;
  }
  while (i < len && str.charCodeAt(i) <= 32) i++;
  if (i >= len) return false;
  const code = str.charCodeAt(i);
  // `>` closes the tag and `/` opens `/>`; anything else in that position is
  // what `parseTag` refused, and in practice that is an attribute.
  return code !== 62 && code !== 47;
}

function warnUnclaimedTag(
  template: string,
  index: number,
  len: number,
  extensions: readonly SyntaxExtension[],
): void {
  const next = index + 1 < len ? template.charCodeAt(index + 1) : 0;
  const isLetter = (next >= 65 && next <= 90) || (next >= 97 && next <= 122);
  if (!isLetter || warnedTagTemplates === undefined || warnedTagTemplates.has(template)) return;
  warnedTagTemplates.add(template);

  // Telling an app that already imported "@comvi/core/tags" to import it is the
  // one message guaranteed not to help; when the extension IS present, the only
  // reason it left a tag-like `<` unclaimed is an unsupported attribute.
  const hasTags = extensions.some((e) => e.id === TAGS_EXTENSION_ID);
  warn(
    `[@comvi/core] Tag syntax in "${template}" is rendering as literal text: ` +
      (hasTags && refusedForAttributes(template, index, len)
        ? `attributes are not supported in tag syntax; pass them via the ` +
          `\`components\` config (\`{ tag: "a", props: { href } }\`).`
        : `no tag extension claims "<". Render it with your framework's <T> ` +
          `component, or import "@comvi/core/tags" to register tag syntax for ` +
          `the string API.`),
  );
}

/**
 * Index just past the apostrophe that CLOSES the quoted section opened at
 * `startIndex`, or -1 when nothing closes it. A `''` inside the section is a
 * literal apostrophe and does not close it.
 */
function closingQuoteEnd(str: string, startIndex: number, len: number): number {
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
  return -1;
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
    // An unterminated quote runs to the end of the message, which is ICU's
    // DOUBLE_OPTIONAL rule and what the token scanner wants.
    const end = closingQuoteEnd(str, index, len);
    return end === -1 ? len : end;
  }
  return index + 1;
}

/**
 * `advancePastApostrophe` for a scan that must not be swallowed by a quote
 * that never closes — today the closing-tag scan in `tags.ts`.
 *
 * A BALANCED quoted section is skipped exactly as the message parser skips it,
 * so a `</b>` written inside one keeps its protection. An apostrophe whose own
 * quote is never closed advances by one instead, as the literal it looks like:
 * `<b>l'{name}</b>` is French elision, not a quote, and swallowing the rest of
 * the message would leave the tag unclosed and show its markup as text.
 *
 * The decision is per apostrophe, which is what lets one message hold both
 * shapes — `<b>'{x </b> y}' l'{name}</b>` protects the first and ignores the
 * second.
 */
export function advancePastBalancedApostrophe(
  str: string,
  index: number,
  len: number,
  hashIsSyntax: boolean,
): number {
  if (index + 1 < len && str.charCodeAt(index + 1) === APOSTROPHE) {
    return index + 2;
  }
  if (isQuoteStart(str, index, len, hashIsSyntax)) {
    const end = closingQuoteEnd(str, index, len);
    if (end !== -1) return end;
  }
  return index + 1;
}

/**
 * Every character `parseTemplate` treats as something other than literal
 * text, minus `#` (which is syntax only under `hashIsSyntax`, so its callers
 * ask separately): `{` opens a core argument, `'` starts ICU quoting, and
 * `<`, `&` and `\` are the three positions the scanner offers to the syntax
 * extensions.
 *
 * Exported so a compiler deciding whether a sub-message can be used as the
 * text it already is tests the SAME set the scanner acts on. `&` used to be
 * missing from the ICU compiler's copy of this list, which left `&amp;`
 * escaped inside a plain plural/select branch while the identical text one
 * level up decoded — and made adding a parameter to the branch change it.
 *
 * `&` is narrowed to one that can actually OPEN something: an entity is `&`
 * plus a name or a `#`. A bare `&` is ordinary copy ("Terms & Conditions"),
 * and treating it as a trigger sent branches of plain text through the parser
 * for byte-identical output at +27% on the perf gate's own case. The parser
 * still offers every `&` to the extensions, so nothing an extension claims is
 * lost: the narrowing only decides when re-parsing is worth doing at all, and
 * a `&` followed by anything else is claimed by no shipped grammar. `\` stays
 * broad — only `\<` is an escape, but a lone backslash in translation copy is
 * rare enough that narrowing it buys nothing measurable.
 */
const SYNTAX_CHARS = /['{<\\]|&[#A-Za-z]/;

/** True when `str` holds anything the parser would not pass through as text. */
export function hasSyntaxChars(str: string): boolean {
  return SYNTAX_CHARS.test(str);
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
 *
 * `silenceUnclaimedTagWarning` is the ingestion preflight's opt-out from the
 * dev unclaimed-tag warning, and nothing else reads it. The preflight parses
 * every ingested string, but a catalog entry carrying `<b>` is only a mistake
 * once a `t()` call renders it literally — an app that renders it through `<T>`
 * hands the tag grammar in per call and never registers it on the host, so
 * warning at ingestion is a false positive AND, because the warning dedupes per
 * template, it pre-empts the truthful one from the render path. Read only
 * inside the `IS_DEV` branch below, so production folds it away.
 */
export function parseTemplate(
  template: string,
  hashIsSyntax: boolean,
  extensions: readonly SyntaxExtension[],
  compiler: MessageCompiler,
  silenceUnclaimedTagWarning?: boolean,
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
        // A real tags extension never reaches here: it claimed the `<`.
        if (IS_DEV && code === LESS_THAN && !silenceUnclaimedTagWarning) {
          warnUnclaimedTag(template, i, len, extensions);
        }
        i++;
      }
    } else if (code === HASH && hashIsSyntax && !isQuoted) {
      // A `#` bound to the enclosing plural's count. It becomes a token rather
      // than being substituted into the branch text before the parse, so one
      // cache entry serves every count. A quoted `'#'` never reaches here:
      // `isQuoteStart` claims it above and `isQuoted` is set.
      if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
      tokens.push([TK_HASH]);
      i++;
      lastIndex = i;
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
      warn("[@comvi/core] Unbalanced braces in template");
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
