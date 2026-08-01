import type { TranslationParams, TranslationResult, TagInterpolationOptions } from "../types";
import type { VirtualNode } from "../virtualNode";
import { warn } from "../logger";
import { isPrimitive, isVNodeLoose } from "./translate/params";
import {
  TK_PARAM,
  TK_PLURAL,
  TK_SELECT,
  TK_TEXT,
  TF_HAS_PLURAL,
  TF_HAS_SELECT,
  TF_HAS_TAGS,
  TF_SIMPLE_PARAMS,
  TF_STATIC,
  type TemplateFlags,
  type ParsedToken,
  type PluralToken,
  type SelectToken,
  type CachedTemplate,
} from "./translate/cache";
import { parseTemplate } from "./translate/parser";
import {
  effectiveExtensions,
  effectiveExtBits,
  getCompilerId,
  type MessageCompiler,
  type MissingParamMode,
  type SyntaxExtension,
  type TranslateCtx,
} from "./translate/syntax";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// Character codes for fast comparison
const CHAR_OPEN_BRACE = 123; // {
const CHAR_APOSTROPHE = 39; // '
const CHAR_LESS_THAN = 60; // <
const CHAR_AMPERSAND = 38; // &

// Template compilation cache for performance.
// Key: variant prefix (hash bit + extension bits + compiler id) + template
// string, Value: cached template with metadata. The cache is module-global
// and shared by every entry/instance in the process; the key, not the
// instance, carries compiler identity and the effective extension set.
const templateCache = new Map<string, CachedTemplate>();

// Maximum number of compiled templates to hold before evicting oldest entries.
// Insertion-order eviction (Map iteration is insertion-order in JS).
const TEMPLATE_CACHE_MAX = 1000;

/** @internal */
export function _templateCacheSize(): number {
  return templateCache.size;
}

/**
 * Insert a compiled template into the cache, evicting the oldest entry when the
 * cap is reached. Use instead of raw templateCache.set() everywhere.
 */
function cacheTemplate(key: string, value: CachedTemplate): void {
  if (templateCache.size >= TEMPLATE_CACHE_MAX) {
    templateCache.delete(templateCache.keys().next().value!);
  }
  templateCache.set(key, value);
}

/**
 * Clears the compiled-template cache.
 * Exported for power-user / test use; not called automatically on reload/destroy
 * to avoid cross-instance cache invalidation. Registering or disposing a syntax
 * extension never requires clearing: keys differ by construction.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Check if a template is known to be static (no interpolation) FOR THE GIVEN
 * CACHE VARIANT. "Static" is a property of a parse, and a parse is defined by
 * the full key (template, hashIsSyntax, compilerId, extBits) — there is no
 * cross-variant fallback. Returns undefined if that variant is not yet
 * analyzed.
 */
export function isStaticTemplate(
  template: string,
  hashIsSyntax: boolean,
  compilerId: number,
  extBits: number,
): boolean | undefined {
  return templateCache.get(templateCacheKey(template, hashIsSyntax, compilerId, extBits))
    ?.isStatic;
}

/**
 * Cache key for a compiled template. Parsing depends on whether `#` is syntax
 * (inside a plural/selectordinal sub-message), on the compiler that built the
 * tokens, and on the effective syntax-extension set — so the same string
 * compiles differently per context and needs distinct cache entries.
 *
 * Two-char prefix with non-overlapping fields (headroom by construction):
 * char 1 carries the hash bit plus the extension bits (15 usable bits),
 * char 2 carries the full compiler id.
 */
function templateCacheKey(
  template: string,
  hashIsSyntax: boolean,
  compilerId: number,
  extBits: number,
): string {
  return (
    String.fromCharCode((hashIsSyntax ? 1 : 0) | (extBits << 1)) +
    String.fromCharCode(compilerId) +
    template
  );
}

/**
 * Create cached template with optimization metadata.
 */
function createCachedTemplate(
  template: string,
  hashIsSyntax: boolean,
  extensions: readonly SyntaxExtension[],
  compiler: MessageCompiler,
): CachedTemplate {
  const tokens = parseTemplate(template, hashIsSyntax, extensions, compiler);
  let flags: TemplateFlags = TF_STATIC;

  if (!(tokens.length === 0 || (tokens.length === 1 && tokens[0][0] === TK_TEXT))) {
    let hasDynamic = false;
    for (let i = 0; i < tokens.length; i++) {
      const kind = tokens[i][0];
      if (kind === TK_PARAM) {
        hasDynamic = true;
      } else if (kind === TK_PLURAL) {
        flags |= TF_HAS_PLURAL;
        hasDynamic = true;
      } else if (kind === TK_SELECT) {
        flags |= TF_HAS_SELECT;
        hasDynamic = true;
      } else if (kind !== TK_TEXT) {
        // Extension tokens (tags today)
        flags |= TF_HAS_TAGS;
        hasDynamic = true;
      }
    }
    if (hasDynamic && flags === TF_STATIC) {
      flags = TF_SIMPLE_PARAMS;
    }
  }

  // isStatic gates fast paths that return the RAW template string, so it must
  // mean "rendered output is byte-equal to the template". Quoting and escape
  // sequences ('', '{...}', &lt;, \<) produce text-only tokens whose output
  // differs from the raw template; those must keep rendering through tokens.
  const isStatic =
    flags === TF_STATIC &&
    (tokens.length === 0 || (tokens.length === 1 && tokens[0][1] === template));
  const cached: CachedTemplate = { tokens, flags, isStatic };

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

/** Dev-only dedup of missing-parameter warnings per (template, param) pair. */
const missingParamWarned = IS_DEV ? new Set<string>() : undefined;

/**
 * Literal rendering of a missing (absent or `undefined`) parameter under
 * `missingParam: "literal"`; warns once per (template, param) pair in dev.
 */
function missingParamText(name: string, ctx: TranslateCtx): string {
  if (IS_DEV && missingParamWarned !== undefined) {
    const dedupKey = ctx.template + "\u0000" + name;
    if (!missingParamWarned.has(dedupKey)) {
      missingParamWarned.add(dedupKey);
      warn(`[i18n] Missing parameter "${name}" for template "${ctx.template}"`);
    }
  }
  return "{" + name + "}";
}

function makeCtx(
  template: string,
  params: TranslationParams,
  locale: string,
  tagInterpolation: TagInterpolationOptions | undefined,
  compiler: MessageCompiler,
  missingParam: MissingParamMode,
): TranslateCtx {
  const perCall = tagInterpolation?.extensions;
  return {
    template,
    params,
    locale,
    tagInterpolation,
    compiler,
    compilerId: getCompilerId(compiler),
    extensions: effectiveExtensions(perCall),
    extBits: effectiveExtBits(perCall),
    missingParam,
    pluralRules: undefined,
  };
}

/**
 * Main translation function.
 */
export function translate(
  template: string,
  locale: string,
  params: TranslationParams | undefined,
  tagInterpolation: TagInterpolationOptions | undefined,
  compiler: MessageCompiler,
  missingParam: MissingParamMode = "literal",
): TranslationResult {
  const perCall = tagInterpolation?.extensions;
  const cacheKey = templateCacheKey(
    template,
    false,
    getCompilerId(compiler),
    effectiveExtBits(perCall),
  );
  const cached = templateCache.get(cacheKey);
  if (cached) {
    // Already cached - use cached analysis
    if (cached.isStatic) {
      return template;
    }
    const ctx = makeCtx(
      template,
      params ?? EMPTY_PARAMS,
      locale,
      tagInterpolation,
      compiler,
      missingParam,
    );
    return translateTemplateWithCache(cached, ctx, false);
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
    cacheTemplate(cacheKey, {
      tokens: [],
      flags: TF_STATIC,
      isStatic: true,
    });
    return template;
  }

  const ctx = makeCtx(
    template,
    params ?? EMPTY_PARAMS,
    locale,
    tagInterpolation,
    compiler,
    missingParam,
  );
  return translateSegment(template, ctx, false);
}

/**
 * Get-or-compile a template for the ctx's cache variant and render it.
 * Used for top-level templates and for nested dynamic segments (which reuse
 * the parent ctx, so nested parses land in the same cache variant).
 */
function translateSegment(
  segment: string,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): TranslationResult {
  const cacheKey = templateCacheKey(segment, hashIsSyntax, ctx.compilerId, ctx.extBits);
  let cached = templateCache.get(cacheKey);
  if (!cached) {
    cached = createCachedTemplate(segment, hashIsSyntax, ctx.extensions, ctx.compiler);
    cacheTemplate(cacheKey, cached);
  }
  return translateTemplateWithCache(cached, ctx, hashIsSyntax);
}

/**
 * Processes the template (compile if needed, then render).
 */
export function translateTemplate(
  template: string,
  params: TranslationParams,
  locale: string,
  tagInterpolation: TagInterpolationOptions | undefined,
  compiler: MessageCompiler,
  missingParam: MissingParamMode = "literal",
  hashIsSyntax = false,
): TranslationResult {
  const ctx = makeCtx(template, params, locale, tagInterpolation, compiler, missingParam);
  return translateSegment(template, ctx, hashIsSyntax);
}

/**
 * Process template with pre-existing cached data.
 */
function translateTemplateWithCache(
  cached: CachedTemplate,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): TranslationResult {
  // Fast path for single-param templates: "Hello, {name}!" -> prefix + value + suffix
  if (cached.singleParamName !== undefined) {
    const value = ctx.params[cached.singleParamName];
    if (value !== undefined && value !== null) {
      const t = typeof value;
      if (t === "string" || t === "number" || t === "boolean") {
        return cached.prefix! + value + cached.suffix!;
      }
      // Non-primitive value - fall through to full processing
    } else {
      const prefix = cached.prefix!;
      const suffix = cached.suffix!;
      if (value === undefined && ctx.missingParam === "literal") {
        // Absent/undefined param renders as the literal placeholder
        return prefix + missingParamText(cached.singleParamName, ctx) + suffix;
      }
      // null (explicit erasure, both modes) or "drop" mode: empty string
      return prefix ? (suffix ? prefix + suffix : prefix) : suffix;
    }
  }

  if (cached.flags === TF_SIMPLE_PARAMS) {
    return processSimpleParams(cached.tokens, ctx);
  }

  // Full processing for complex templates
  const resultParts = processTokens(cached.tokens, ctx, hashIsSyntax);
  return finalizeResult(resultParts);
}

/**
 * Fast path for templates with only text and simple params.
 */
function processSimpleParams(tokens: ParsedToken[], ctx: TranslateCtx): TranslationResult {
  const params = ctx.params;
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
              appendParamValue(parts, params[token[1]], token[1], ctx);
            }
          }

          return finalizeResult(parts);
        }
      } else if (value === undefined && ctx.missingParam === "literal") {
        result += missingParamText(token[1], ctx);
      }
      // null: explicit erasure — empty string in both modes
    }
  }
  return result;
}

export function finalizeResult(parts: Array<string | VirtualNode>): TranslationResult {
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
 * Missing (undefined) params follow ctx.missingParam; null always erases.
 */
function appendParamValue(
  parts: Array<string | VirtualNode>,
  value: unknown,
  name: string,
  ctx: TranslateCtx,
): void {
  if (value === undefined) {
    if (ctx.missingParam === "literal") {
      appendString(parts, missingParamText(name, ctx));
    }
    return;
  }
  if (value === null) return;
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
export function processDynamicSegment(
  segment: string,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): Array<string | VirtualNode> {
  const result = translateSegment(segment, ctx, hashIsSyntax);
  return Array.isArray(result) ? result : [result];
}

/**
 * Processes parsed tokens into result parts.
 *
 * Compiler-owned argument tokens (plural/select) dispatch through
 * `ctx.compiler.processArgToken`; extension tokens (tags) dispatch through
 * the effective extension set's process-hooks. Cache-variant keying
 * guarantees a token kind only appears when its producer is present.
 */
export function processTokens(
  tokens: ParsedToken[],
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): Array<string | VirtualNode> {
  const parts: Array<string | VirtualNode> = [];
  let lastIdx = -1;

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
      const value = ctx.params[token[1]];
      if (value !== undefined || ctx.missingParam === "literal") {
        const prevLength = parts.length;
        appendParamValue(parts, value, token[1], ctx);
        if (parts.length > prevLength) {
          lastIdx = parts.length - 1;
        }
      }
      continue;
    }

    if (kind === TK_PLURAL || kind === TK_SELECT) {
      const processArg = ctx.compiler.processArgToken;
      if (processArg !== undefined) {
        appendResult(parts, processArg(token as PluralToken | SelectToken, ctx, hashIsSyntax));
        lastIdx = parts.length - 1;
      }
      continue;
    }

    // Extension tokens (tags today)
    for (let e = 0; e < ctx.extensions.length; e++) {
      const result = ctx.extensions[e].processHook(token, ctx, hashIsSyntax);
      if (result !== undefined) {
        appendResult(parts, result);
        lastIdx = parts.length - 1;
        break;
      }
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
