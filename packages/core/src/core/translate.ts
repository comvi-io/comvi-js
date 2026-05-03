import type {
  TranslationParams,
  TranslationResult,
  TagInterpolationOptions,
  TagCallback,
} from "../types";
import type { VirtualNode } from "../virtualNode";
import { createElement } from "../virtualNode";
import { warn } from "../logger";
import { isPrimitive, isVNodeLoose } from "./translate/params";
import {
  getPluralRules,
  TK_PARAM,
  TK_PLURAL,
  TK_SELECT,
  TK_TAG,
  TK_TEXT,
  TF_HAS_PLURAL,
  TF_HAS_SELECT,
  TF_HAS_TAGS,
  TF_SIMPLE_PARAMS,
  TF_STATIC,
  type TemplateFlags,
  type ParsedToken,
  type TagToken,
  type CachedTemplate,
} from "./translate/cache";
import { parseTemplate, parsePluralChoices, clearPluralChoicesCache } from "./translate/parser";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// Character codes for fast comparison
const CHAR_OPEN_BRACE = 123; // {
const CHAR_APOSTROPHE = 39; // '
const CHAR_LESS_THAN = 60; // <
const CHAR_AMPERSAND = 38; // &

// Template compilation cache for performance
// Key: template string, Value: cached template with metadata
const templateCache = new Map<string, CachedTemplate>();

/**
 * Clears all translation-related caches.
 * Should be called when translations are cleared or reloaded.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  clearPluralChoicesCache();
}

/**
 * Check if a template is known to be static (no interpolation).
 * Returns undefined if not yet analyzed.
 */
export function isStaticTemplate(template: string): boolean | undefined {
  return templateCache.get(template)?.isStatic;
}

/**
 * Create cached template with optimization metadata.
 */
function createCachedTemplate(template: string): CachedTemplate {
  const tokens = parseTemplate(template);
  let flags: TemplateFlags = TF_STATIC;

  if (!(tokens.length === 0 || (tokens.length === 1 && tokens[0][0] === TK_TEXT))) {
    let hasDynamic = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const kind = token[0];
      if (kind === TK_PARAM) {
        hasDynamic = true;
      } else if (kind === TK_PLURAL) {
        if (token[3] === undefined) {
          token[3] = parsePluralChoices(token[2]);
        }
        if (token[4] === undefined) {
          token[4] = token[2].indexOf("=") !== -1 ? 1 : 0;
        }
        flags |= TF_HAS_PLURAL;
        hasDynamic = true;
      } else if (kind === TK_SELECT) {
        if (token[3] === undefined) {
          token[3] = parsePluralChoices(token[2]);
        }
        flags |= TF_HAS_SELECT;
        hasDynamic = true;
      } else if (kind === TK_TAG) {
        flags |= TF_HAS_TAGS;
        hasDynamic = true;
      }
    }
    if (hasDynamic && flags === TF_STATIC) {
      flags = TF_SIMPLE_PARAMS;
    }
  }

  const cached: CachedTemplate = { tokens, flags, isStatic: flags === TF_STATIC };

  // Pre-compute single param template parts for fast-path
  if (
    flags === TF_SIMPLE_PARAMS &&
    tokens.length === 3 &&
    tokens[0][0] === TK_TEXT &&
    tokens[1][0] === TK_PARAM &&
    tokens[2][0] === TK_TEXT
  ) {
    cached.prefix = tokens[0][1];
    cached.singleParamName = tokens[1][1];
    cached.suffix = tokens[2][1];
  } else if (flags === TF_SIMPLE_PARAMS && tokens.length === 2) {
    // Handle "{param}suffix" or "prefix{param}"
    if (tokens[0][0] === TK_PARAM && tokens[1][0] === TK_TEXT) {
      cached.prefix = "";
      cached.singleParamName = tokens[0][1];
      cached.suffix = tokens[1][1];
    } else if (tokens[0][0] === TK_TEXT && tokens[1][0] === TK_PARAM) {
      cached.prefix = tokens[0][1];
      cached.singleParamName = tokens[1][1];
      cached.suffix = "";
    }
  } else if (flags === TF_SIMPLE_PARAMS && tokens.length === 1 && tokens[0][0] === TK_PARAM) {
    // Handle "{param}" only
    cached.prefix = "";
    cached.singleParamName = tokens[0][1];
    cached.suffix = "";
  }

  return cached;
}

// Empty params object singleton to avoid allocations
const EMPTY_PARAMS: TranslationParams = Object.freeze({});

/**
 * Main translation function.
 */
export function translate(
  template: string,
  locale: string,
  params?: TranslationParams,
  tagInterpolation?: TagInterpolationOptions,
): TranslationResult {
  const cached = templateCache.get(template);
  if (cached) {
    // Already cached - use cached analysis
    if (cached.isStatic) {
      return template;
    }
    const safeParams = params ?? EMPTY_PARAMS;
    return translateTemplateWithCache(cached, safeParams, locale, tagInterpolation);
  }

  let hasSpecialChar = false;
  for (let i = 0; i < template.length; i++) {
    const c = template.charCodeAt(i);
    if (
      c === CHAR_OPEN_BRACE ||
      c === CHAR_APOSTROPHE ||
      c === CHAR_LESS_THAN ||
      c === CHAR_AMPERSAND
    ) {
      hasSpecialChar = true;
      break;
    }
  }
  if (!hasSpecialChar) {
    templateCache.set(template, { tokens: [], flags: TF_STATIC, isStatic: true });
    return template;
  }

  const safeParams = params ?? EMPTY_PARAMS;
  return translateTemplate(template, safeParams, locale, tagInterpolation);
}

/**
 * Process template with pre-existing cached data.
 */
function translateTemplateWithCache(
  cached: CachedTemplate,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
): TranslationResult {
  // Fast path for single-param templates: "Hello, {name}!" -> prefix + value + suffix
  if (cached.singleParamName !== undefined) {
    const value = params[cached.singleParamName];
    if (value !== undefined && value !== null) {
      const t = typeof value;
      if (t === "string") {
        return cached.prefix! + value + cached.suffix!;
      }
      if (t === "number" || t === "boolean") {
        return cached.prefix! + value + cached.suffix!;
      }
      // Non-primitive value - fall through to full processing
    } else {
      // undefined/null param - combine prefix + suffix
      const prefix = cached.prefix!;
      const suffix = cached.suffix!;
      return prefix ? (suffix ? prefix + suffix : prefix) : suffix;
    }
  }

  if (cached.flags === TF_SIMPLE_PARAMS) {
    return processSimpleParams(cached.tokens, params);
  }

  // Full processing for complex templates
  const pluralRules = (cached.flags & TF_HAS_PLURAL) !== 0 ? getPluralRules(locale) : undefined;
  const resultParts = processTokens(cached.tokens, params, locale, tagInterpolation, pluralRules);
  return finalizeResult(resultParts);
}

/**
 * Processes the template.
 */
export function translateTemplate(
  template: string,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
): TranslationResult {
  // Get or create cached template with metadata
  let cached = templateCache.get(template);
  if (!cached) {
    cached = createCachedTemplate(template);
    templateCache.set(template, cached);
  }

  return translateTemplateWithCache(cached, params, locale, tagInterpolation);
}

/**
 * Fast path for templates with only text and simple params.
 */
function processSimpleParams(tokens: ParsedToken[], params: TranslationParams): TranslationResult {
  let result = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const kind = token[0];
    if (kind === TK_TEXT) {
      result += token[1];
    } else if (kind === TK_PARAM) {
      const value = params[token[1]];
      if (value != null) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          result += value;
        } else {
          const parts: Array<string | VirtualNode> = [];
          if (result) {
            parts.push(result);
          }

          for (; i < tokens.length; i++) {
            const token = tokens[i];
            const kind = token[0];
            if (kind === TK_TEXT) {
              appendString(parts, token[1]);
            } else if (kind === TK_PARAM) {
              appendParamValue(parts, params[token[1]]);
            }
          }

          return finalizeResult(parts);
        }
      }
    }
  }
  return result;
}

function finalizeResult(parts: Array<string | VirtualNode>): TranslationResult {
  if (parts.length === 1 && typeof parts[0] === "string") {
    return parts[0];
  }
  return parts.every(isPrimitive) ? parts.join("") : parts;
}

/**
 * Helper: append string to parts array, merging with last element if possible.
 */
function appendString(parts: Array<string | VirtualNode>, str: string): void {
  const lastIdx = parts.length - 1;
  const lastPart = parts[lastIdx];
  if (lastIdx >= 0 && typeof lastPart === "string") {
    parts[lastIdx] = lastPart + str;
  } else {
    parts.push(str);
  }
}

/**
 * Helper: append a translation parameter value to parts.
 * Supports primitives, VNodes, and TranslationResult arrays.
 */
function appendParamValue(parts: Array<string | VirtualNode>, value: unknown): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item == null) continue;
      if (isVNodeLoose(item)) {
        parts.push(item as VirtualNode);
      } else {
        appendString(parts, String(item));
      }
    }
    return;
  }
  if (isVNodeLoose(value)) {
    parts.push(value as VirtualNode);
    return;
  }
  appendString(parts, String(value));
}

/**
 * Processes a dynamic segment (outside single quotes).
 * It scans for balanced tokens and processes them.
 * Uses caching to avoid re-parsing the same template strings.
 */
function processDynamicSegment(
  segment: string,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
): Array<string | VirtualNode> {
  const result = translateTemplate(segment, params, locale, tagInterpolation);
  return Array.isArray(result) ? result : [result];
}

/**
 * Processes parsed tokens into result parts.
 */
function processTokens(
  tokens: ParsedToken[],
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
  pluralRules?: Intl.PluralRules,
): Array<string | VirtualNode> {
  const parts: Array<string | VirtualNode> = [];
  let lastIdx = parts.length - 1;

  for (const token of tokens) {
    const kind = token[0];

    if (kind === TK_TEXT) {
      // Merge with previous string if possible
      const lastPart = parts[lastIdx];
      if (lastIdx >= 0 && typeof lastPart === "string") {
        parts[lastIdx] = lastPart + token[1];
      } else {
        parts.push(token[1]);
        lastIdx++;
      }
      continue;
    }

    if (kind === TK_PARAM) {
      const value = params[token[1]];
      if (value != null) {
        const prevLength = parts.length;
        appendParamValue(parts, value);
        if (parts.length > prevLength) {
          lastIdx = parts.length - 1;
        }
      }
      continue;
    }

    // Less common cases: plural, select, tag
    if (kind === TK_PLURAL) {
      const pluralResult = processPlural(
        token[1],
        token[2],
        token[3] ?? parsePluralChoices(token[2]),
        token[4] === 1,
        token[5] === 1,
        params,
        locale,
        tagInterpolation,
        pluralRules,
      );
      appendResult(parts, pluralResult);
      lastIdx = parts.length - 1;
      continue;
    }

    if (kind === TK_SELECT) {
      const selectResult = processSelect(
        token[1],
        token[3] ?? parsePluralChoices(token[2]),
        params,
        locale,
        tagInterpolation,
      );
      appendResult(parts, selectResult);
      lastIdx = parts.length - 1;
      continue;
    }

    if (kind === TK_TAG) {
      const tagResult = processTag(token, params, locale, tagInterpolation);
      appendResult(parts, tagResult);
      lastIdx = parts.length - 1;
    }
  }

  return parts;
}

/**
 * Helper to append a result (string, VNode, or array) to parts array.
 * Merges consecutive strings for efficiency.
 */
function appendResult(
  parts: Array<string | VirtualNode>,
  result: string | VirtualNode | Array<string | VirtualNode>,
): void {
  if (typeof result === "string") {
    appendString(parts, result);
  } else if (Array.isArray(result)) {
    for (const part of result) {
      if (typeof part === "string") appendString(parts, part);
      else parts.push(part);
    }
  } else {
    parts.push(result);
  }
}

/**
 * Processes an ICU plural token.
 */
function processPlural(
  param: string,
  choicesStr: string,
  choices: Record<string, string>,
  hasExactSelectors: boolean,
  isOrdinal: boolean,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
  pluralRules?: Intl.PluralRules,
): string | Array<string | VirtualNode> {
  const count = Number(params[param]);
  if (isNaN(count)) {
    warn(
      IS_DEV
        ? `[i18n] Invalid plural parameter value for "${param}": expected number, got ${typeof params[param]}`
        : "E_INVALID_PLURAL_PARAM",
      { param, value: params[param] },
    );
    return `{${param}, ${isOrdinal ? "selectordinal" : "plural"}, ${choicesStr}}`;
  }

  let selected: string | undefined;
  if (hasExactSelectors) {
    selected = choices["=" + count];
  }
  if (selected === undefined) {
    const rules = isOrdinal
      ? getPluralRules(locale, true)
      : (pluralRules ?? getPluralRules(locale));
    const category = rules.select(count);
    selected = choices[category] ?? choices.other ?? "";
  }

  const hashIdx = selected.indexOf("#");
  if (hashIdx !== -1) {
    const countStr = String(count);
    const secondHash = selected.indexOf("#", hashIdx + 1);
    if (secondHash === -1) {
      selected = selected.slice(0, hashIdx) + countStr + selected.slice(hashIdx + 1);
    } else {
      selected = selected.split("#").join(countStr);
    }
  }

  if (selected.indexOf("{") !== -1 || selected.indexOf("<") !== -1) {
    const nestedResult = processDynamicSegment(selected, params, locale, tagInterpolation);
    return finalizeResult(nestedResult);
  }

  return selected;
}

/**
 * Processes an ICU select token.
 * Expects choices string of the form:
 *   male {He} female {She} other {They}
 * Matches param value directly to keys.
 */
function processSelect(
  param: string,
  choices: Record<string, string>,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
): string | Array<string | VirtualNode> {
  const value = String(params[param] ?? "");

  // Direct match or fallback to 'other'
  const selected = choices[value] ?? choices.other ?? "";

  // Process nested tokens if they exist (ICU params or tags)
  if (selected.includes("{") || selected.includes("<")) {
    const nestedResult = processDynamicSegment(selected, params, locale, tagInterpolation);
    return finalizeResult(nestedResult);
  }

  return selected;
}

/**
 * Processes a tag token.
 * Handles:
 * - Tag handlers from params (TagCallback functions)
 * - Basic HTML tags from whitelist
 * - Strict mode behavior (fallback, warn, error)
 */
function processTag(
  token: TagToken,
  params: TranslationParams,
  locale: string,
  tagInterpolation?: TagInterpolationOptions,
): string | VirtualNode | Array<string | VirtualNode> {
  const tagName = token[1];
  const children = token[2];
  const isSelfClosing = token[3] === 1;

  // Process children first to get their result
  const childrenResult = processTokens(children, params, locale, tagInterpolation);
  const flattenedChildren = finalizeResult(childrenResult);

  // Check for tag handler in params
  const handler = params[tagName];
  if (typeof handler === "function") {
    return (handler as TagCallback)({
      children: flattenedChildren,
      name: tagName,
    });
  }

  // Check for basic HTML tags whitelist
  if (tagInterpolation?.basicHtmlTags?.includes(tagName)) {
    // Render as basic HTML VNode
    return createElement(tagName, {}, isSelfClosing ? [] : childrenResult);
  }

  // Handle missing handler based on strict mode
  const strict = tagInterpolation?.strict;

  if (strict === true) {
    throw new Error(
      IS_DEV ? `[i18n] Missing handler for tag: <${tagName}>` : "E_MISSING_TAG_HANDLER",
    );
  }

  if (strict === "warn") {
    const message = IS_DEV
      ? `[i18n] Missing handler for tag: <${tagName}>. Falling back to inner text.`
      : "E_MISSING_TAG_FALLBACK";
    if (tagInterpolation?.onTagWarning) {
      try {
        tagInterpolation.onTagWarning(tagName);
      } catch {
        warn(message);
      }
    } else {
      warn(message);
    }
  }

  return flattenedChildren;
}
