import { warn } from "../../logger";
import {
  TK_PARAM,
  TK_PLURAL,
  TK_SELECT,
  TK_TAG,
  TK_TEXT,
  type ParsedToken,
  type TagToken,
  type ParamToken,
  type PluralToken,
  type SelectToken,
} from "./cache";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

const APOSTROPHE = 39;
const BACKSLASH = 92;
const AMPERSAND = 38;
const OPEN_BRACE = 123;
const CLOSE_BRACE = 125;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const SLASH = 47;
const COMMA = 44;
const HYPHEN = 45;
const UNDERSCORE = 95;
const SPACE = 32;
const DIGIT_0 = 48;
const DIGIT_9 = 57;
const UPPER_A = 65;
const UPPER_Z = 90;
const LOWER_A = 97;
const LOWER_Z = 122;
const ASCII_MAX = 127;

// Plural choices cache
const pluralChoicesCache = new Map<string, Record<string, string>>();

export function clearPluralChoicesCache(): void {
  pluralChoicesCache.clear();
}

function isTagNameStartChar(code: number): boolean {
  return (code >= UPPER_A && code <= UPPER_Z) || (code >= LOWER_A && code <= LOWER_Z);
}

function isTagNameChar(code: number): boolean {
  return (
    (code >= UPPER_A && code <= UPPER_Z) ||
    (code >= LOWER_A && code <= LOWER_Z) ||
    (code >= DIGIT_0 && code <= DIGIT_9) ||
    code === HYPHEN
  );
}

function isWordCharCode(code: number): boolean {
  if (
    (code >= UPPER_A && code <= UPPER_Z) ||
    (code >= LOWER_A && code <= LOWER_Z) ||
    (code >= DIGIT_0 && code <= DIGIT_9) ||
    code === UNDERSCORE
  ) {
    return true;
  }
  return code > ASCII_MAX;
}

/**
 * Smart Apostrophe: treat apostrophe as literal if surrounded by word chars.
 * E.g., "don't" → literal, "'text'" → delimiter
 */
function isSmartApostrophe(str: string, index: number, len: number): boolean {
  return (
    index > 0 &&
    index + 1 < len &&
    isWordCharCode(str.charCodeAt(index - 1)) &&
    isWordCharCode(str.charCodeAt(index + 1))
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

function advancePastApostrophe(str: string, index: number, len: number): number {
  if (index + 1 < len && str.charCodeAt(index + 1) === APOSTROPHE) {
    return index + 2;
  }
  if (isSmartApostrophe(str, index, len)) {
    return index + 1;
  }
  return skipQuotedSection(str, index, len);
}

function findMatchingBraceEnd(str: string, startIndex: number, len: number): number {
  let braceCount = 1;
  let i = startIndex;

  while (i < len && braceCount > 0) {
    const code = str.charCodeAt(i);

    if (code === APOSTROPHE) {
      i = advancePastApostrophe(str, i, len);
      continue;
    }

    if (code === OPEN_BRACE) braceCount++;
    else if (code === CLOSE_BRACE) braceCount--;
    i++;
  }

  return braceCount === 0 ? i : -1;
}

function parseTag(
  str: string,
  startIndex: number,
  len: number,
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
    const children = parseTemplate(innerContent);

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

export function parseTemplate(template: string): ParsedToken[] {
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
      } else if (isSmartApostrophe(template, i, len)) {
        i++;
      } else {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        isQuoted = !isQuoted;
        i++;
        lastIndex = i;
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
      const tagResult = parseTag(template, i, len);

      if (tagResult.isTag && tagResult.token) {
        if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
        tokens.push(tagResult.token);
        i = tagResult.endIndex;
        lastIndex = i;
      } else {
        i++;
      }
    } else if (code === OPEN_BRACE && !isQuoted) {
      if (i > lastIndex) tokens.push([TK_TEXT, template.slice(lastIndex, i)]);
      const tokenResult = extractToken(template, i);
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
): { token?: ParsedToken; endIndex: number; shouldBreak: boolean } {
  const len = segment.length;
  const endIndex = findMatchingBraceEnd(segment, startIndex + 1, len);

  if (endIndex === -1) {
    if (IS_DEV) {
      warn("[i18n] Unbalanced braces in template");
    }
    return { endIndex: len, shouldBreak: true };
  }

  const tokenContent = segment.slice(startIndex + 1, endIndex - 1);
  return { token: createTokenFromContent(tokenContent), endIndex, shouldBreak: false };
}

export function createTokenFromContent(
  tokenContent: string,
): ParamToken | PluralToken | SelectToken {
  let firstComma = -1;
  let secondComma = -1;
  let depth = 0;
  const len = tokenContent.length;

  for (let k = 0; k < len; k++) {
    const code = tokenContent.charCodeAt(k);

    if (code === APOSTROPHE) {
      k = advancePastApostrophe(tokenContent, k, len) - 1;
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
    const paramName = tokenContent.slice(0, firstComma).trim();
    const typeStr = tokenContent.slice(firstComma + 1, secondComma).trim();
    if (typeStr === "plural" || typeStr === "selectordinal") {
      const choicesStr = tokenContent.slice(secondComma + 1).trim();
      return [
        TK_PLURAL,
        paramName,
        choicesStr,
        undefined,
        undefined,
        typeStr === "selectordinal" ? 1 : 0,
      ];
    }
    if (typeStr === "select") {
      const choicesStr = tokenContent.slice(secondComma + 1).trim();
      return [TK_SELECT, paramName, choicesStr, undefined];
    }
  }

  return [TK_PARAM, tokenContent.trim()];
}

export function parsePluralChoices(choicesStr: string): Record<string, string> {
  const cached = pluralChoicesCache.get(choicesStr);
  if (cached) return cached;

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
    const endIndex = findMatchingBraceEnd(choicesStr, valueStart, len);
    if (endIndex === -1) break;

    choices[key] = choicesStr.slice(valueStart, endIndex - 1);
    i = endIndex;
  }

  pluralChoicesCache.set(choicesStr, choices);
  return choices;
}
