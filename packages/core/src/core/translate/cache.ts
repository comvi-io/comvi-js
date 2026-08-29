// Template classification, so rendering can pick a fast path by complexity.
export const TF_STATIC = 0;
export const TF_SIMPLE_PARAMS = 1;
export const TF_HAS_PLURAL = 2;
export const TF_HAS_SELECT = 4;
export const TF_HAS_TAGS = 8;
export type TemplateFlags = number;

export interface CachedTemplate {
  tokens: ParsedToken[];
  flags: TemplateFlags;
  /** True only when rendered output is byte-equal to the raw template. */
  isStatic?: boolean;
  /** Set only for a single-param template; `prefix`/`suffix` surround the `{param}`. */
  singleParamName?: string;
  prefix?: string;
  suffix?: string;
}

/** Tuples rather than objects: less runtime overhead and fewer bundle bytes. */
export type ParsedToken = TextToken | ParamToken | PluralToken | SelectToken | TagToken;

export const TK_TEXT = 0;
export const TK_PARAM = 1;
export const TK_PLURAL = 2;
export const TK_SELECT = 3;
export const TK_TAG = 4;

/** Plain text segment: [TEXT, content] */
export type TextToken = [typeof TK_TEXT, string];

/** Parameter interpolation: [PARAM, paramName] */
export type ParamToken = [typeof TK_PARAM, string];

/** ICU plural: [PLURAL, paramName, choicesStr, parsedChoices?, hasExactSelectorFlag?, isOrdinalFlag?] */
export type PluralToken = [
  typeof TK_PLURAL,
  string,
  string,
  Record<string, string>?,
  (0 | 1)?,
  (0 | 1)?,
];

/** ICU select: [SELECT, paramName, choicesStr] */
export type SelectToken = [typeof TK_SELECT, string, string, Record<string, string>?];

/** XML-like tag: [TAG, tagName, children, selfClosingFlag] */
export type TagToken = [typeof TK_TAG, string, ParsedToken[], 0 | 1];

export function getPluralRules(locale: string, ordinal: boolean = false): Intl.PluralRules {
  const cacheKey = ordinal ? locale + ":o" : locale;
  let rules = pluralRulesCache.get(cacheKey);

  if (!rules) {
    const opts = ordinal ? { type: "ordinal" as const } : undefined;
    try {
      rules = new Intl.PluralRules(locale, opts);
    } catch {
      // An invalid locale falls back to the runtime default.
      rules = new Intl.PluralRules(undefined, opts);
    }
    pluralRulesCache.set(cacheKey, rules);
  }

  return rules;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();
