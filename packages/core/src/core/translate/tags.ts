import type { TagCallback } from "../../types";
import type { VirtualNode } from "../../virtualNode";
import { createElement } from "../../virtualNode";
import { warn } from "../../logger";
import { TK_TAG, TK_TEXT, type ParsedToken, type TagToken } from "./cache";
import { parseTemplate } from "./parser";
import {
  registerSyntaxExtension,
  type MessageCompiler,
  type SyntaxExtension,
  type TranslateCtx,
} from "./syntax";
import { finalizeResult, processTokens } from "../translate";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const AMPERSAND = 38;
const BACKSLASH = 92;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const SLASH = 47;
const HYPHEN = 45;
const UNDERSCORE = 95;
const SPACE = 32;
const DIGIT_0 = 48;
const DIGIT_9 = 57;
const UPPER_A = 65;
const UPPER_Z = 90;
const LOWER_A = 97;
const LOWER_Z = 122;

function isTagNameStartChar(code: number): boolean {
  return (code >= UPPER_A && code <= UPPER_Z) || (code >= LOWER_A && code <= LOWER_Z);
}

function isTagNameChar(code: number): boolean {
  return (
    (code >= UPPER_A && code <= UPPER_Z) ||
    (code >= LOWER_A && code <= LOWER_Z) ||
    (code >= DIGIT_0 && code <= DIGIT_9) ||
    code === HYPHEN ||
    code === UNDERSCORE
  );
}

function parseTag(
  str: string,
  startIndex: number,
  len: number,
  hashIsSyntax: boolean,
  extensions: readonly SyntaxExtension[],
  compiler: MessageCompiler,
): { token?: TagToken; endIndex: number; isTag: boolean } {
  let i = startIndex + 1;

  if (i < len && str.charCodeAt(i) === SLASH) {
    return { endIndex: startIndex + 1, isTag: false };
  }

  if (i >= len || !isTagNameStartChar(str.charCodeAt(i))) {
    return { endIndex: startIndex + 1, isTag: false };
  }

  const tagNameStart = i;
  while (i < len && isTagNameChar(str.charCodeAt(i))) i++;
  const tagName = str.slice(tagNameStart, i);

  while (i < len && str.charCodeAt(i) <= SPACE) i++;

  if (i >= len) {
    return { endIndex: startIndex + 1, isTag: false };
  }

  const code = str.charCodeAt(i);

  // Self-closing: <tag/>
  if (code === SLASH) {
    if (i + 1 < len && str.charCodeAt(i + 1) === GREATER_THAN) {
      return {
        token: [TK_TAG, tagName, [], 1],
        endIndex: i + 2,
        isTag: true,
      };
    }
    return { endIndex: startIndex + 1, isTag: false };
  }

  // Opening: <tag>
  if (code === GREATER_THAN) {
    i++;
    const contentStart = i;
    const result = findClosingTag(str, i, len, tagName);

    if (!result) {
      return { endIndex: startIndex + 1, isTag: false };
    }

    const [closingStart, endIndex] = result;

    const innerContent = str.slice(contentStart, closingStart);
    const children = parseTemplate(innerContent, hashIsSyntax, extensions, compiler);

    return {
      token: [TK_TAG, tagName, children, 0],
      endIndex,
      isTag: true,
    };
  }

  return { endIndex: startIndex + 1, isTag: false };
}

function findClosingTag(
  str: string,
  startIndex: number,
  len: number,
  tagName: string,
): [closingStart: number, endIndex: number] | undefined {
  const tagStack: string[] = [tagName];
  let i = startIndex;

  while (i < len && tagStack.length > 0) {
    const code = str.charCodeAt(i);

    if (code === BACKSLASH) {
      i += 2;
      continue;
    }

    if (code === LESS_THAN) {
      const nextCode = i + 1 < len ? str.charCodeAt(i + 1) : 0;

      // Closing tag
      if (nextCode === SLASH) {
        const closeTagStart = i;
        i += 2;
        const closeNameStart = i;
        while (i < len && isTagNameChar(str.charCodeAt(i))) i++;
        const closeName = str.slice(closeNameStart, i);
        while (i < len && str.charCodeAt(i) <= SPACE) i++;

        if (i < len && str.charCodeAt(i) === GREATER_THAN) {
          i++;
          const expectedTag = tagStack[tagStack.length - 1];
          if (closeName === expectedTag) {
            tagStack.pop();
            if (tagStack.length === 0) {
              return [closeTagStart, i];
            }
          } else {
            if (IS_DEV) {
              warn(`[i18n] Tag mismatch: expected </${expectedTag}>, found </${closeName}>`);
            }
            return undefined;
          }
        }
        continue;
      }

      // Opening tag
      if (isTagNameStartChar(nextCode)) {
        const openTagStart = i;
        i++;
        const openNameStart = i;
        while (i < len && isTagNameChar(str.charCodeAt(i))) i++;
        const openName = str.slice(openNameStart, i);
        while (i < len && str.charCodeAt(i) <= SPACE) i++;

        if (i < len) {
          const afterNameCode = str.charCodeAt(i);
          if (afterNameCode === SLASH && i + 1 < len && str.charCodeAt(i + 1) === GREATER_THAN) {
            i += 2;
            continue;
          }
          if (afterNameCode === GREATER_THAN) {
            i++;
            tagStack.push(openName);
            continue;
          }
        }
        i = openTagStart + 1;
        continue;
      }
    }

    i++;
  }

  if (tagStack.length > 0) {
    if (IS_DEV) {
      warn(`[i18n] Unclosed tag: <${tagStack[tagStack.length - 1]}>`);
    }
    return undefined;
  }

  return undefined;
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
  ctx: TranslateCtx,
  hashIsSyntax: boolean,
): string | VirtualNode | Array<string | VirtualNode> {
  const tagName = token[1];
  const children = token[2];
  const isSelfClosing = token[3] === 1;
  const tagInterpolation = ctx.tagInterpolation;

  // Process children first to get their result
  const childrenResult = processTokens(children, ctx, hashIsSyntax);
  const flattenedChildren = finalizeResult(childrenResult);

  // Check for tag handler in params
  const handler = ctx.params[tagName];
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

/**
 * The `&…;` entities the tag grammar owns, longest match irrelevant (no
 * prefix collisions). They exist so a translator can write a literal angle
 * bracket or ampersand inside a message that IS tag syntax; in a graph with
 * no tag extension there is no `<` grammar to escape from, so the sequences
 * stay literal text.
 */
const ENTITIES: Array<[source: string, char: string]> = [
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
];

/**
 * The XML-like tag syntax extension. Pass it per call through
 * `tagInterpolation.extensions` (ordering-proof channel used by `<T>` /
 * `prepareTranslation`) or register it ambiently via `registerTagSyntax()`
 * (string-API channel; done automatically by importing `@comvi/core` or
 * `@comvi/core/tags`).
 *
 * It claims three characters from the shared scanner, all one grammar:
 * `<` (a tag), `&` (an entity) and `\` (the `\<` escape). Returning a
 * `TK_TEXT` token for the latter two is what keeps the decoded character out
 * of the raw-template fast path — `createCachedTemplate` only reports
 * `isStatic` when the single text token IS the template.
 */
export const tagSyntaxExtension: SyntaxExtension = {
  id: "comvi:tags",
  cacheBit: 1,
  parseHook(template, index, len, hashIsSyntax, extensions, compiler) {
    const code = template.charCodeAt(index);

    if (code === AMPERSAND) {
      for (const [source, char] of ENTITIES) {
        if (template.startsWith(source, index)) {
          return { token: [TK_TEXT, char], endIndex: index + source.length };
        }
      }
      return undefined;
    }

    if (code === BACKSLASH) {
      return index + 1 < len && template.charCodeAt(index + 1) === LESS_THAN
        ? { token: [TK_TEXT, "<"], endIndex: index + 2 }
        : undefined;
    }

    const result = parseTag(template, index, len, hashIsSyntax, extensions, compiler);
    return result.isTag && result.token !== undefined
      ? { token: result.token, endIndex: result.endIndex }
      : undefined;
  },
  processHook(token: ParsedToken, ctx, hashIsSyntax) {
    return token[0] === TK_TAG ? processTag(token as TagToken, ctx, hashIsSyntax) : undefined;
  },
};

/**
 * Register tag syntax ambiently (module-global): plain string-API `t()` calls
 * parse `<tag>...</tag>` afterwards. Idempotent; returns a disposer that
 * removes the registration (SSR multi-tenant / test escape hatch).
 */
export function registerTagSyntax(): () => void {
  return registerSyntaxExtension(tagSyntaxExtension);
}
