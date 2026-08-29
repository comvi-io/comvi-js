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

export function parsePluralChoices(
  choicesStr: string,
  hashIsSyntax = true,
): Record<string, string> {
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
      break;
    }

    const valueStart = i + 1;
    const endIndex = findMatchingBraceEnd(
      choicesStr,
      valueStart,
      len,
      hashIsSyntax,
      isPluralArgStart,
    );
    if (endIndex === -1) break;

    choices[key] = choicesStr.slice(valueStart, endIndex - 1);
    i = endIndex;
  }

  return choices;
}

/**
 * Build a token from `{...}` content: `{name}` params plus the ICU
 * `plural` / `selectordinal` / `select` argument types. Choices are parsed
 * eagerly so rendering never re-parses them.
 */
function makeIcuArgToken(
  content: string,
  hashIsSyntax: boolean,
): ParamToken | PluralToken | SelectToken {
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

  if (firstComma !== -1 && secondComma !== -1) {
    const paramName = content.slice(0, firstComma).trim();
    const typeStr = content.slice(firstComma + 1, secondComma).trim();
    if (typeStr === "plural" || typeStr === "selectordinal") {
      const choicesStr = content.slice(secondComma + 1).trim();
      return [
        TK_PLURAL,
        paramName,
        choicesStr,
        parsePluralChoices(choicesStr),
        choicesStr.indexOf("=") !== -1 ? 1 : 0,
        typeStr === "selectordinal" ? 1 : 0,
      ];
    }
    if (typeStr === "select") {
      const choicesStr = content.slice(secondComma + 1).trim();
      return [TK_SELECT, paramName, choicesStr, parsePluralChoices(choicesStr, hashIsSyntax)];
    }
  }

  return [TK_PARAM, content.trim()];
}

function processPlural(
  token: PluralToken,
  ctx: TranslateCtx,
): string | Array<string | VirtualNode> {
  const param = token[1];
  const choicesStr = token[2];
  const choices = token[3] ?? parsePluralChoices(choicesStr);
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

  selected = replaceTopLevelHash(selected, String(count));

  if (
    selected.indexOf("{") !== -1 ||
    selected.indexOf("<") !== -1 ||
    selected.indexOf("'") !== -1
  ) {
    return translateSegment(selected, ctx, true);
  }

  return selected;
}

/** Choices are `male {He} female {She} other {They}`; the param value matches a key directly. */
function processSelect(
  token: SelectToken,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): string | Array<string | VirtualNode> {
  const param = token[1];
  const choices = token[3] ?? parsePluralChoices(token[2], hashIsSyntax);
  const value = String(ctx.params[param] ?? "");

  const selected = choices[value] ?? choices.other ?? "";

  // A chosen branch may itself contain ICU params, tags or quoting.
  if (selected.includes("{") || selected.includes("<") || selected.includes("'")) {
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
  makeArgToken: makeIcuArgToken,
  argOpensHashScope: isPluralArgStart,
  processArgToken(token, ctx, hashIsSyntax) {
    return token[0] === TK_PLURAL
      ? processPlural(token as PluralToken, ctx)
      : processSelect(token as SelectToken, ctx, hashIsSyntax);
  },
};
