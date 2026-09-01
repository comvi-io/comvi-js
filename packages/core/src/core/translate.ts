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

const CHAR_OPEN_BRACE = 123; // {
const CHAR_APOSTROPHE = 39; // '
const CHAR_LESS_THAN = 60; // <
const CHAR_AMPERSAND = 38; // &

// Module-global and shared by every entry/instance in the process: the KEY,
// not the instance, carries compiler identity and the effective extension set.
const templateCache = new Map<string, CachedTemplate>();

// Eviction is insertion-order, which works because JS Map iteration is.
const TEMPLATE_CACHE_MAX = 1000;

/** @internal */
export function _templateCacheSize(): number {
  return templateCache.size;
}

/** Use instead of a raw `templateCache.set()` — this is what enforces the cap. */
function cacheTemplate(key: string, value: CachedTemplate): void {
  if (templateCache.size >= TEMPLATE_CACHE_MAX) {
    templateCache.delete(templateCache.keys().next().value!);
  }
  templateCache.set(key, value);
}

/**
 * Deliberately NOT called on reload/destroy — the cache is shared, so that would
 * invalidate other instances. Registering or disposing a syntax extension never
 * requires clearing either: the keys differ by construction.
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
  return templateCache.get(templateCacheKey(template, hashIsSyntax, compilerId, extBits))?.isStatic;
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
    cached.prefix = "";
    cached.singleParamName = tokens[0][1];
    cached.suffix = "";
  }

  return cached;
}

// Shared singleton: a paramless call must not allocate.
const EMPTY_PARAMS: TranslationParams = Object.freeze({});

/** Dev-only dedup of missing-parameter warnings per (template, param) pair. */
const missingParamWarned = IS_DEV ? new Set<string>() : undefined;

/** @internal Test teardown: forgets which (template, param) pairs already warned. */
export function _resetMissingParamWarnings(): void {
  missingParamWarned?.clear();
}

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
 * Nested dynamic segments reuse the PARENT ctx, so their parses land in the
 * same cache variant.
 */
export function translateSegment(
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
  // `translate()` stores static templates as a token-less placeholder; rendering that entry
  // through the token path would yield "" (a per-call `fallback` equal to a catalog value hit this).
  if (cached.isStatic) return segment;
  return translateTemplateWithCache(cached, ctx, hashIsSyntax);
}

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

function translateTemplateWithCache(
  cached: CachedTemplate,
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): TranslationResult {
  if (cached.singleParamName !== undefined) {
    const value = ctx.params[cached.singleParamName];
    if (value !== undefined && value !== null) {
      const t = typeof value;
      if (t === "string" || t === "number" || t === "boolean") {
        return cached.prefix! + value + cached.suffix!;
      }
    } else {
      const prefix = cached.prefix!;
      const suffix = cached.suffix!;
      if (value === undefined && ctx.missingParam === "literal") {
        return prefix + missingParamText(cached.singleParamName, ctx) + suffix;
      }
      return prefix + suffix;
    }
  }

  if (cached.flags === TF_SIMPLE_PARAMS) {
    return processSimpleParams(cached.tokens, ctx);
  }

  const resultParts = processTokens(cached.tokens, ctx, hashIsSyntax);
  return finalizeResult(resultParts);
}

/** Fast path: text and simple params only — no plural, select or tag tokens. */
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

function appendString(parts: Array<string | VirtualNode>, str: string): void {
  const lastIdx = parts.length - 1;
  const lastPart = parts[lastIdx];
  if (lastIdx >= 0 && typeof lastPart === "string") {
    parts[lastIdx] = lastPart + str;
  } else {
    parts.push(str);
  }
}

/** Missing (`undefined`) params follow `ctx.missingParam`; `null` always erases. */
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

  for (const token of tokens) {
    const kind = token[0];

    if (kind === TK_TEXT) {
      appendString(parts, token[1]);
      continue;
    }

    if (kind === TK_PARAM) {
      const value = ctx.params[token[1]];
      if (value !== undefined || ctx.missingParam === "literal") {
        appendParamValue(parts, value, token[1], ctx);
      }
      continue;
    }

    if (kind === TK_PLURAL || kind === TK_SELECT) {
      const processArg = ctx.compiler.processArgToken;
      if (processArg !== undefined) {
        appendResult(parts, processArg(token as PluralToken | SelectToken, ctx, hashIsSyntax));
      }
      continue;
    }

    // An extension token — tags, today.
    for (let e = 0; e < ctx.extensions.length; e++) {
      const result = ctx.extensions[e].processHook(token, ctx, hashIsSyntax);
      if (result !== undefined) {
        appendResult(parts, result);
        break;
      }
    }
  }

  return parts;
}

/** Merges consecutive strings rather than pushing them as separate parts. */
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
