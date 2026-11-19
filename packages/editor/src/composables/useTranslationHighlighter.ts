import { computed, type Ref } from "vue";

/**
 * Composable for highlighting XML tags and ICU placeholders in translation text.
 * Validates tag pairs and highlights errors/warnings.
 *
 * Ported from platform/apps/web — keep behavior in sync if changed there.
 */

type TokenType =
  | "xml-open-valid"
  | "xml-close-valid"
  | "xml-self-closing"
  | "xml-open-unclosed"
  | "xml-close-orphan"
  | "xml-close-mismatch"
  | "icu-placeholder"
  | "double-brace"
  | "text";

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

interface XmlTag {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  start: number;
  end: number;
  raw: string;
}

const TOKEN_CLASSES: Record<Exclude<TokenType, "text">, string> = {
  "xml-open-valid": "bg-muted text-muted-foreground",
  "xml-close-valid": "bg-muted text-muted-foreground",
  "xml-self-closing": "bg-muted text-muted-foreground",
  "icu-placeholder": "bg-accent-soft text-primary",
  "double-brace": "bg-accent-soft text-primary",
  "xml-open-unclosed": "bg-destructive/15 text-destructive",
  "xml-close-orphan": "bg-destructive/20 text-destructive",
  "xml-close-mismatch": "bg-destructive/20 text-destructive",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseXmlTags(text: string): XmlTag[] {
  const tags: XmlTag[] = [];
  const pattern = /<(\/?)\s*([a-zA-Z][a-zA-Z0-9_:-]*)[^>]*(\/?)>/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2]!.toLowerCase();
    const isSelfClosing = match[3] === "/" || match[0].endsWith("/>");

    tags.push({
      name: tagName,
      isClosing,
      isSelfClosing: isSelfClosing && !isClosing,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  return tags;
}

function validateXmlTags(tags: XmlTag[]): Map<number, TokenType> {
  const result = new Map<number, TokenType>();
  const openStack: Array<{ name: string; start: number }> = [];

  for (const tag of tags) {
    if (tag.isSelfClosing) {
      result.set(tag.start, "xml-self-closing");
    } else if (!tag.isClosing) {
      openStack.push({ name: tag.name, start: tag.start });
    } else {
      if (openStack.length === 0) {
        result.set(tag.start, "xml-close-orphan");
      } else {
        const lastOpen = openStack[openStack.length - 1]!;
        if (lastOpen.name === tag.name) {
          result.set(lastOpen.start, "xml-open-valid");
          result.set(tag.start, "xml-close-valid");
          openStack.pop();
        } else {
          const matchIndex = openStack.findIndex((o) => o.name === tag.name);
          if (matchIndex >= 0) {
            for (let i = openStack.length - 1; i > matchIndex; i--) {
              result.set(openStack[i]!.start, "xml-open-unclosed");
            }
            result.set(openStack[matchIndex]!.start, "xml-open-valid");
            result.set(tag.start, "xml-close-valid");
            openStack.splice(matchIndex);
          } else {
            result.set(tag.start, "xml-close-mismatch");
          }
        }
      }
    }
  }

  for (const open of openStack) {
    result.set(open.start, "xml-open-unclosed");
  }

  return result;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const usedRanges: Array<{ start: number; end: number }> = [];

  const isOverlapping = (start: number, end: number): boolean => {
    return usedRanges.some(
      (range) =>
        (start >= range.start && start < range.end) ||
        (end > range.start && end <= range.end) ||
        (start <= range.start && end >= range.end),
    );
  };

  const xmlTags = parseXmlTags(text);
  const tagStatuses = validateXmlTags(xmlTags);

  for (const tag of xmlTags) {
    const status = tagStatuses.get(tag.start);
    if (status && !isOverlapping(tag.start, tag.end)) {
      tokens.push({
        type: status,
        value: tag.raw,
        start: tag.start,
        end: tag.end,
      });
      usedRanges.push({ start: tag.start, end: tag.end });
    }
  }

  const doubleBracePattern = /\{\{([^{}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = doubleBracePattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isOverlapping(start, end)) {
      tokens.push({ type: "double-brace", value: match[0], start, end });
      usedRanges.push({ start, end });
    }
  }

  const icuPlaceholderPattern = /\{([^{},\s]+)\}/g;
  while ((match = icuPlaceholderPattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isOverlapping(start, end)) {
      tokens.push({ type: "icu-placeholder", value: match[0], start, end });
      usedRanges.push({ start, end });
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  return tokens;
}

function highlightText(text: string): string {
  if (!text) return "";

  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return escapeHtml(text);
  }

  const parts: string[] = [];
  let lastEnd = 0;

  for (const token of tokens) {
    if (token.start > lastEnd) {
      parts.push(escapeHtml(text.slice(lastEnd, token.start)));
    }

    if (token.type !== "text") {
      const classes = TOKEN_CLASSES[token.type];
      parts.push(`<span class="${classes}">${escapeHtml(token.value)}</span>`);
    } else {
      parts.push(escapeHtml(token.value));
    }

    lastEnd = token.end;
  }

  if (lastEnd < text.length) {
    parts.push(escapeHtml(text.slice(lastEnd)));
  }

  return parts.join("");
}

export function useTranslationHighlighter(text: Ref<string>) {
  const highlightedHtml = computed(() => highlightText(text.value));

  return {
    highlightedHtml,
  };
}
