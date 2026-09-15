import type { VirtualNode } from "../../virtualNode";
import { warn } from "../../logger";
import {
  getPluralRules,
  hashValue,
  setHashValue,
  TK_PARAM,
  TK_PLURAL,
  TK_SELECT,
  type ParamToken,
  type PluralToken,
  type SelectToken,
} from "./cache";
import { advancePastApostrophe, findMatchingBraceEnd, hasSyntaxChars } from "./parser";
import { setIcuHit, type IcuSyntaxError } from "./compile-simple";
import type { MessageCompiler, TranslateCtx } from "./syntax";
import { translateSegment } from "../translate";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const APOSTROPHE = 39;
const OPEN_BRACE = 123;
const CLOSE_BRACE = 125;
const COMMA = 44;
const SPACE = 32;
const EQUALS = 61;

/**
 * Detects whether the `{` at braceIndex starts a plural/selectordinal
 * argument (`{name, plural, ...}`), i.e. a scope that rebinds `#` to its own
 * count. Wired into the parser as `icuCompiler.argOpensHashScope`.
 */
export function isPluralArgStart(str: string, braceIndex: number, len: number): boolean {
  let i = braceIndex + 1;
  while (i < len) {
    const code = str.charCodeAt(i);
    if (code === COMMA) break;
    if (code === OPEN_BRACE || code === CLOSE_BRACE) return false;
    i++;
  }
  if (i >= len) return false;
  i++;
  while (i < len && str.charCodeAt(i) <= SPACE) i++;
  const typeStart = i;
  while (i < len) {
    const code = str.charCodeAt(i);
    if (code === COMMA || code <= SPACE || code === OPEN_BRACE || code === CLOSE_BRACE) break;
    i++;
  }
  const type = str.slice(typeStart, i);
  return type === "plural" || type === "selectordinal";
}
/**
 * Replaces every `#` in a plural sub-message with the count.
 *
 * Reached only from the TEXT-ONLY fast path in `processPlural`: a branch that
 * gets here holds none of the parser's syntax characters (`hasSyntaxChars`),
 * so there is no nested plural whose `#` must be skipped and no quoted `'#'`
 * to protect. Any branch that holds one of them is re-parsed instead, and its
 * `#` becomes a `TK_HASH` token the renderer resolves against `hashValue`.
 */
export function replaceTopLevelHash(str: string, replacement: string): string {
  let at = str.indexOf("#");
  if (at === -1) return str;
  // Sliced rather than `split("#").join(replacement)`: splitting allocates an
  // array to rebuild the string, which measured ~25 ns/op more on the perf
  // gate's plural case — the hottest shape this file has.
  let out = "";
  let from = 0;
  while (at !== -1) {
    out += str.slice(from, at) + replacement;
    from = at + 1;
    at = str.indexOf("#", from);
  }
  return out + str.slice(from);
}

/**
 * Parse `one {…} other {…}` into a selector→sub-message map.
 *
 * Returns `null` when the list is malformed — a selector with no braced
 * sub-message, or a sub-message whose brace never closes. Both used to yield
 * the choices parsed so far, which rendered a wrong branch or an empty string;
 * the caller now fails the argument loud instead.
 */
export function parsePluralChoices(
  choicesStr: string,
  hashIsSyntax: boolean,
): Record<string, string> | null {
  const choices = Object.create(null) as Record<string, string>;
  const len = choicesStr.length;
  let i = 0;

  while (i < len) {
    while (i < len && choicesStr.charCodeAt(i) <= SPACE) i++;
    if (i >= len) break;

    const keyStart = i;
    while (i < len) {
      const code = choicesStr.charCodeAt(i);
      if (code <= SPACE || code === OPEN_BRACE) break;
      i++;
    }
    const key = choicesStr.slice(keyStart, i);

    while (i < len && choicesStr.charCodeAt(i) <= SPACE) i++;
    // Past the end `charCodeAt` is NaN, so this also covers a trailing selector
    // with no sub-message at all.
    if (choicesStr.charCodeAt(i) !== OPEN_BRACE) return null;

    const valueStart = i + 1;
    const endIndex = findMatchingBraceEnd(
      choicesStr,
      valueStart,
      len,
      hashIsSyntax,
      isPluralArgStart,
    );
    if (endIndex === -1) return null;

    choices[key] = choicesStr.slice(valueStart, endIndex - 1);
    i = endIndex;
  }

  return choices;
}

/**
 * An argument this compiler cannot compile, handled exactly as ICU syntax on
 * the simple compiler: development throws `E_ICU_SYNTAX` (at the ingestion
 * preflight, or at the first render of a template that never passed through a
 * catalog), production returns `undefined` so the braced segment renders
 * literally and records the type for the host's one best-effort report.
 *
 * `malformedChoices` carries the offending choice list, and is `undefined`
 * when the argument itself is the problem — an unknown type, or a known one
 * with no choice list at all. It selects the message only; both messages are
 * development-only text and fold out of production.
 */
function failIcuArg(
  argumentType: string,
  content: string,
  malformedChoices: string | undefined,
  badExactSelector?: string,
): undefined {
  if (!IS_DEV) {
    setIcuHit(argumentType);
    return undefined;
  }
  const error = new Error(
    badExactSelector !== undefined
      ? `[i18n] The exact selector \`${badExactSelector}\` in the \`${argumentType}\` choice list \`${malformedChoices}\` is not a number; an ICU exact selector is \`=\` followed by a number, as in \`=1 {…}\``
      : malformedChoices === undefined
        ? `[i18n] ICU argument \`{${content}}\` is not supported: this compiler implements \`plural\`, \`selectordinal\` and \`select\`, each with a choice list like \`other {…}\`. Quote the braces ('{'…'}') or format the value in code and pass it as a plain {param}`
        : `[i18n] The \`${argumentType}\` choice list \`${malformedChoices}\` is malformed; every selector needs a braced sub-message, as in \`other {…}\``,
  ) as IcuSyntaxError;
  error.code = "E_ICU_SYNTAX";
  error.argumentType = argumentType;
  throw error;
}

/**
 * ICU's explicit-value grammar: `=` followed by a number, and a number is an
 * optional sign, digits, and at most one fractional part. Deliberately NOT
 * `Number()`, which also swallows `0x1`, `1e3`, `+1`, `.5`, `Infinity` and the
 * empty string — none of which an ICU message may write, and each of which
 * would then match some count nobody declared a branch for.
 */
const EXACT_VALUE = /^-?\d+(\.\d+)?$/;

/**
 * Rewrite every `=N` selector of a freshly parsed plural choice list to the
 * canonical spelling of its number, because render-time lookup is
 * `"=" + count` and only `String(count)` is what a count produces. `=1.0` and
 * `=01` are both the `n = 1` branch; ICU matches explicit selectors BEFORE the
 * plural categories, so one that never matched used to fall through to
 * `one`/`other` silently.
 *
 * Rebuilt into a FRESH map in source order rather than rewritten in place: two
 * selectors can canonicalize to the same number (`=1.0` and `=1`, or `=-0` and
 * `=0`, since `String(-0)` is `"0"` and ICU compares numbers), and the one the
 * translator wrote LAST has to win — the same rule two identical verbatim
 * selectors already followed. Rewriting a snapshot of the keys made an earlier
 * selector overwrite a later one instead. The map is this compiler's own, never
 * the caller's catalog.
 *
 * `Number()` is still the canonicalizer once the grammar has passed, and that
 * is exactly right for a selector past 2^53: the probe compares against a JS
 * number, so such a selector can only ever be matched by the value it rounds
 * to, and that is the value it is stored as.
 *
 * A selector outside the grammar returns `undefined` through `failIcuArg`:
 * `E_ICU_SYNTAX` in development, a literal segment plus one host report in
 * production, rather than a branch that silently can never be chosen.
 */
function canonicalizeExactSelectors(
  choices: Record<string, string>,
  argumentType: string,
  content: string,
  choicesStr: string,
): Record<string, string> | undefined {
  const keys = Object.keys(choices);
  const canonical = Object.create(null) as Record<string, string>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.charCodeAt(0) !== EQUALS) {
      canonical[key] = choices[key];
      continue;
    }
    const value = key.slice(1);
    if (!EXACT_VALUE.test(value)) {
      return failIcuArg(argumentType, content, choicesStr, key);
    }
    canonical["=" + Number(value)] = choices[key];
  }
  return canonical;
}

/**
 * Build a token from `{...}` content: `{name}` params plus the ICU
 * `plural` / `selectordinal` / `select` argument types. Choices are parsed
 * eagerly so rendering never re-parses them.
 *
 * A comma at depth 0 makes the argument TYPED, and only the three types above
 * are implemented — `{price, number}` and friends fail through `failIcuArg`
 * rather than resolving to a parameter literally named `price, number`.
 */
function makeIcuArgToken(
  content: string,
  hashIsSyntax: boolean,
): ParamToken | PluralToken | SelectToken | undefined {
  let firstComma = -1;
  let secondComma = -1;
  let depth = 0;
  const len = content.length;

  for (let k = 0; k < len; k++) {
    const code = content.charCodeAt(k);

    if (code === APOSTROPHE) {
      k = advancePastApostrophe(content, k, len, hashIsSyntax) - 1;
      continue;
    }

    if (code === OPEN_BRACE) depth++;
    else if (code === CLOSE_BRACE) depth--;
    else if (code === COMMA && depth === 0) {
      if (firstComma === -1) firstComma = k;
      else if (secondComma === -1) {
        secondComma = k;
        break;
      }
    }
  }

  if (firstComma === -1) return [TK_PARAM, content.trim()];

  const paramName = content.slice(0, firstComma).trim();
  // A one-comma argument (`{n, plural}`) has a type but no choice list; the
  // type still names it in the failure.
  const typeStr = (
    secondComma === -1 ? content.slice(firstComma + 1) : content.slice(firstComma + 1, secondComma)
  ).trim();
  const isPlural = typeStr === "plural" || typeStr === "selectordinal";

  if (secondComma !== -1) {
    // `#` is syntax in a plural's sub-messages by definition; in a select's it
    // is syntax only when the select is itself inside one. The two arms pass
    // their own answer rather than sharing one expression, so neither can
    // borrow the other's.
    if (isPlural) {
      const choicesStr = content.slice(secondComma + 1).trim();
      const parsed = parsePluralChoices(choicesStr, true);
      if (parsed === null) return failIcuArg(typeStr, content, choicesStr);
      // A stray `=` inside a sub-message also trips this, which costs one walk
      // of the key list and nothing else; the flag's job is only to keep the
      // render-time exact probe off lists that plainly have no `=` at all.
      const hasExact = choicesStr.indexOf("=") !== -1;
      const choices = hasExact
        ? canonicalizeExactSelectors(parsed, typeStr, content, choicesStr)
        : parsed;
      if (choices === undefined) return undefined;
      return [
        TK_PLURAL,
        paramName,
        choicesStr,
        choices,
        hasExact ? 1 : 0,
        typeStr === "selectordinal" ? 1 : 0,
      ];
    }
    if (typeStr === "select") {
      const choicesStr = content.slice(secondComma + 1).trim();
      const choices = parsePluralChoices(choicesStr, hashIsSyntax);
      if (choices === null) return failIcuArg(typeStr, content, choicesStr);
      return [TK_SELECT, paramName, choicesStr, choices];
    }
  }

  return failIcuArg(typeStr, content, undefined);
}

function processPlural(
  token: PluralToken,
  ctx: TranslateCtx,
): string | Array<string | VirtualNode> {
  const param = token[1];
  const choicesStr = token[2];
  // `?? {}` covers a token built by an injected compiler that reuses this
  // processor: `makeIcuArgToken` never emits a token for a list it could not parse.
  const choices = token[3] ?? parsePluralChoices(choicesStr, true) ?? {};
  const hasExactSelectors = token[4] === 1;
  const isOrdinal = token[5] === 1;

  const count = Number(ctx.params[param]);
  if (isNaN(count)) {
    warn(
      IS_DEV
        ? `[i18n] Invalid plural parameter value for "${param}": expected number, got ${typeof ctx.params[param]}`
        : "E_INVALID_PLURAL_PARAM",
      { param, value: ctx.params[param] },
    );
    return `{${param}, ${isOrdinal ? "selectordinal" : "plural"}, ${choicesStr}}`;
  }

  let selected: string | undefined;
  if (hasExactSelectors) {
    // `makeIcuArgToken` already rewrote every `=N` key to `"=" + Number(N)`,
    // so this one string concatenation is the whole match. A token an injected
    // compiler built itself (the `?? parsePluralChoices` arm above) carries its
    // selectors as written, and matches only the ones already canonical.
    selected = choices["=" + count];
  }
  if (selected === undefined) {
    const rules = isOrdinal
      ? getPluralRules(ctx.locale, true)
      : (ctx.pluralRules ??= getPluralRules(ctx.locale));
    const category = rules.select(count);
    selected = choices[category] ?? choices.other ?? "";
  }

  const replacement = String(count);

  if (hasSyntaxChars(selected)) {
    // The branch goes to the parser UNCHANGED, so its cache entry is shared by
    // every count; `#` arrives as a token the renderer resolves against
    // `hashValue`. The previous count is restored afterwards — an inner plural
    // must not clobber the count an outer `#` after it still resolves against.
    const prev = hashValue;
    setHashValue(replacement);
    const result = translateSegment(selected, ctx, true);
    setHashValue(prev);
    return result;
  }

  // Text-only branch — the hottest plural shape ("# items"). No parse, no cache
  // entry, so substituting into the text costs nothing and saves the token pass.
  return replaceTopLevelHash(selected, replacement);
}

/** Choices are `male {He} female {She} other {They}`; the param value matches a key directly. */
function processSelect(
  token: SelectToken,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): string | Array<string | VirtualNode> {
  const param = token[1];
  const choices = token[3] ?? parsePluralChoices(token[2], hashIsSyntax) ?? {};
  const value = String(ctx.params[param] ?? "");

  const selected = choices[value] ?? choices.other ?? "";

  // A chosen branch may itself contain ICU params, extension syntax (tags,
  // entities, the `\<` escape) or quoting — and, inside a plural sub-message, a
  // `#` that belongs to the enclosing plural. A select never rebinds `#`, so
  // `hashValue` carries straight through.
  if (hasSyntaxChars(selected) || (hashIsSyntax && selected.includes("#"))) {
    return translateSegment(selected, ctx, hashIsSyntax);
  }

  return selected;
}

/**
 * The full ICU message compiler: `{param}`, `plural`, `selectordinal`,
 * `select`. Reachable ONLY through the pure `@comvi/core/icu` subpath and the
 * composite; pass it as `compiler` to get ICU behaviour on a base host.
 */
export const icuCompiler: MessageCompiler = {
  cid: 2,
  preflight: true,
  makeArgToken: makeIcuArgToken,
  argOpensHashScope: isPluralArgStart,
  processArgToken(token, ctx, hashIsSyntax) {
    return token[0] === TK_PLURAL
      ? processPlural(token as PluralToken, ctx)
      : processSelect(token as SelectToken, ctx, hashIsSyntax);
  },
};
