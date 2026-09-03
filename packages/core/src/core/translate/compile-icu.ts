import type { VirtualNode } from "../../virtualNode";
import { warn } from "../../logger";
import {
  getPluralRules,
  TK_PARAM,
  TK_PLURAL,
  TK_SELECT,
  type ParamToken,
  type PluralToken,
  type SelectToken,
} from "./cache";
import { advancePastApostrophe, findMatchingBraceEnd } from "./parser";
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
const HASH = 35;

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
 * Replaces `#` octothorpes bound to the current plural with `replacement`.
 * Per ICU MessageFormat, only a nested plural/selectordinal rebinds `#`, so
 * those blocks are skipped wholesale while other nested arguments (select,
 * params) stay transparent. Quoted `'…'` literals are never touched.
 */
export function replaceTopLevelHash(str: string, replacement: string): string {
  if (str.indexOf("#") === -1) return str;

  const len = str.length;
  let out = "";
  let segStart = 0;
  let i = 0;

  while (i < len) {
    const code = str.charCodeAt(i);
    if (code === APOSTROPHE) {
      i = advancePastApostrophe(str, i, len, true);
      continue;
    }
    if (code === OPEN_BRACE && isPluralArgStart(str, i, len)) {
      const end = findMatchingBraceEnd(str, i + 1, len, true, isPluralArgStart);
      i = end === -1 ? len : end;
      continue;
    }
    if (code === HASH) {
      out += str.slice(segStart, i) + replacement;
      segStart = i + 1;
    }
    i++;
  }

  return out + str.slice(segStart);
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
  hashIsSyntax = true,
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
    if (i >= len || choicesStr.charCodeAt(i) !== OPEN_BRACE) {
      return null;
    }

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
 * when the argument type itself is the problem. It selects the message only;
 * both messages are development-only text and fold out of production.
 */
function failIcuArg(argumentType: string, malformedChoices: string | undefined): undefined {
  if (!IS_DEV) {
    setIcuHit(argumentType);
    return undefined;
  }
  const error = new Error(
    malformedChoices === undefined
      ? `[i18n] ICU argument type \`${argumentType}\` is not supported; quote the braces ('{'…'}') or format the value in code and pass it as a plain {param}`
      : `[i18n] The \`${argumentType}\` choice list \`${malformedChoices}\` is malformed; every selector needs a braced sub-message, as in \`other {…}\``,
  ) as IcuSyntaxError;
  error.code = "E_ICU_SYNTAX";
  error.argumentType = argumentType;
  throw error;
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

  if (secondComma !== -1 && (isPlural || typeStr === "select")) {
    const choicesStr = content.slice(secondComma + 1).trim();
    const choices = parsePluralChoices(choicesStr, isPlural || hashIsSyntax);
    if (choices === null) return failIcuArg(typeStr, choicesStr);
    if (isPlural) {
      return [
        TK_PLURAL,
        paramName,
        choicesStr,
        choices,
        choicesStr.indexOf("=") !== -1 ? 1 : 0,
        typeStr === "selectordinal" ? 1 : 0,
      ];
    }
    return [TK_SELECT, paramName, choicesStr, choices];
  }

  return failIcuArg(typeStr, undefined);
}

function processPlural(
  token: PluralToken,
  ctx: TranslateCtx,
): string | Array<string | VirtualNode> {
  const param = token[1];
  const choicesStr = token[2];
  // `?? {}` covers a token built by an injected compiler that reuses this
  // processor: `makeIcuArgToken` never emits a token for a list it could not parse.
  const choices = token[3] ?? parsePluralChoices(choicesStr) ?? {};
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

  if (
    selected.indexOf("{") !== -1 ||
    selected.indexOf("<") !== -1 ||
    selected.indexOf("'") !== -1
  ) {
    // The branch goes to the parser UNCHANGED, so its cache entry is shared by
    // every count; `#` arrives as a token the renderer resolves against
    // `ctx.hash`. `translateSegment` reuses this ctx, so the previous count is
    // restored — an inner plural must not clobber the count an outer `#` after
    // it still resolves against.
    const prev = ctx.hash;
    ctx.hash = replacement;
    const result = translateSegment(selected, ctx, true);
    ctx.hash = prev;
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

  // A chosen branch may itself contain ICU params, tags or quoting — and,
  // inside a plural sub-message, a `#` that belongs to the enclosing plural.
  // A select never rebinds `#`, so `ctx.hash` carries straight through.
  if (
    selected.includes("{") ||
    selected.includes("<") ||
    selected.includes("'") ||
    (hashIsSyntax && selected.includes("#"))
  ) {
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
