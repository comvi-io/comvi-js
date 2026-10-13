// Template classification, so rendering can pick a fast path by complexity.
export const TF_STATIC = 0;
export const TF_SIMPLE_PARAMS = 1;
export const TF_HAS_PLURAL = 2;
export const TF_HAS_SELECT = 4;
export const TF_HAS_TAGS = 8;
export const TF_HAS_HASH = 16;
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
export type ParsedToken = TextToken | ParamToken | PluralToken | SelectToken | TagToken | HashToken;

export const TK_TEXT = 0;
export const TK_PARAM = 1;
export const TK_PLURAL = 2;
export const TK_SELECT = 3;
export const TK_TAG = 4;
export const TK_HASH = 5;

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

/**
 * ICU `#`, bound to the count of the plural sub-message it sits in: [HASH].
 * Nullary — the count comes from `hashValue` at render time, so one parse of a
 * branch serves every count instead of one cache entry per distinct count.
 */
export type HashToken = [typeof TK_HASH];

/**
 * The count a `#` resolves to, for the branch being rendered right now.
 *
 * Module state rather than a `TranslateCtx` field: the ctx is allocated on
 * every non-static `t()`, and an eleventh property measured ~4 % on the
 * `t()`-with-a-param case of `pnpm perf` — the hottest call in the library —
 * while a `#` is only ever read inside a plural. `processPlural` saves the
 * previous value and restores it after the branch, so a nested plural cannot
 * clobber the count an outer `#` still needs; renders are synchronous, so
 * there is no second reader between the two. A value left behind by a handler
 * that threw mid-render is unreadable: `#` only becomes a token under
 * `hashIsSyntax`, which only `processPlural` turns on, after setting it.
 */
export let hashValue: string | undefined;

export function setHashValue(next: string | undefined): void {
  hashValue = next;
}

/**
 * The number format a plural `#` is rendered with: ICU MessageFormat defines
 * `#` as the count formatted for the message's locale, so `1234` is
 * `1,234` in `en` and `1.234` in `de`. Plain-locale formatters only, keyed by
 * the locale string; bounded like `pluralRulesCache` for the same reason.
 *
 * `plainInts` records, once per locale, whether the formatter writes the
 * integers below 1000 exactly as `String()` does: same digits and the same
 * minus sign (`-123`). Grouping starts at 1000 in every CLDR locale, so for
 * those counts `String(count)` is the identical output at a fraction of the
 * cost, and it is the common plural case. Locales with other numbering
 * systems or minus signs fail the probe and always go through `Intl`.
 */
interface HashFormat {
  format: Intl.NumberFormat;
  plainInts: boolean;
}
const hashFormatCache = new Map<string, HashFormat>();
let lastHashLocale = "";
let lastHashFormat: HashFormat | undefined;

function getHashFormat(locale: string): HashFormat {
  let entry = hashFormatCache.get(locale);
  if (!entry) {
    let format: Intl.NumberFormat;
    try {
      format = new Intl.NumberFormat(locale);
    } catch {
      // An invalid locale falls back to the runtime default, like the plural rules.
      format = new Intl.NumberFormat(undefined);
    }
    // One probe covers the digits, the grouping threshold and the minus sign.
    entry = { format, plainInts: format.format(-123) === "-123" };
    if (hashFormatCache.size >= PLURAL_RULES_CACHE_MAX) {
      hashFormatCache.delete(hashFormatCache.keys().next().value!);
    }
    hashFormatCache.set(locale, entry);
  }
  return entry;
}

/** The text a `#` stands for: `count` formatted for `locale`. */
export function formatHashCount(locale: string, count: number): string {
  if (locale !== lastHashLocale || lastHashFormat === undefined) {
    lastHashFormat = getHashFormat(locale);
    lastHashLocale = locale;
  }
  // Negative zero renders `0`, as `String(-0)` already does: `+ 0` turns it
  // into positive zero for Intl, which would otherwise print the sign.
  if (lastHashFormat.plainInts && count > -1000 && count < 1000 && count % 1 === 0) {
    return String(count);
  }
  return lastHashFormat.format.format(count + 0);
}

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
    // Bounded like the Intl caches in `format.ts` and the template cache:
    // `locale` can come from `params.locale`, i.e. from an SSR request header.
    if (pluralRulesCache.size >= PLURAL_RULES_CACHE_MAX) {
      pluralRulesCache.delete(pluralRulesCache.keys().next().value!);
    }
    pluralRulesCache.set(cacheKey, rules);
  }

  return rules;
}

// Eviction is insertion-order, which works because JS Map iteration is.
const PLURAL_RULES_CACHE_MAX = 1000;
const pluralRulesCache = new Map<string, Intl.PluralRules>();
