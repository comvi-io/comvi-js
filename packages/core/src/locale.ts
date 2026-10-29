/**
 * Locale tags: canonicalization, the fallback parent chain, text direction and
 * negotiation — ONE module for core, the locale detector, Next and Nuxt (design
 * §1.5, synthesis §4.2), so every package agrees on the golden table:
 *
 *   pt-BR → pt → (fallbackLocale);  zh-HK → zh-TW, never zh-CN;  zh-Hant → zh-TW;
 *   sr-Cyrl never → sr-Latn;  iw → he;  en_US / EN-us → en-US;
 *   requested ['uk-UA', 'de-DE'] with supported ['en', 'de'] → de.
 *
 * Script rule: a tag only falls back to (or matches) a tag of the SAME script after
 * likely-subtags maximization (`Intl.Locale#maximize`). `zh` maximizes to Hans, so
 * `zh-HK` (Hant) never reaches it; `sr` maximizes to Cyrl, so `sr-Latn` never does.
 */

/**
 * Canonical forms, likely subtags and parent chains: pure functions of the tag, so one
 * process-level memo serves every instance and request (an instance is built per SSR
 * request); capped like the Intl cache, since tags can come from user input.
 */
let memo = new Map<string, unknown>();

const once = <T>(key: string, make: () => T): T => {
  if (memo.has(key)) return memo.get(key) as T;
  // Computed BEFORE the cap: `make` may recurse into `once` (parents → maximize) and roll
  // the memo over, and the value must land in the map that is current afterwards.
  const v = make();
  if (memo.size >= 1000) memo = new Map();
  memo.set(key, v);
  return v;
};

const maximize = (tag: string): Intl.Locale =>
  once("m" + tag, () => new Intl.Locale(tag).maximize());

/**
 * The canonical BCP 47 spelling of a tag (`en_US` → `en-US`, `EN-us` → `en-US`,
 * `iw` → `he`), or `undefined` when it is not a well-formed tag.
 */
export const canonicalize = (tag: string): string | undefined =>
  once("c" + tag, () => {
    try {
      return Intl.getCanonicalLocales(tag.replace(/_/g, "-"))[0];
    } catch {
      // Not a tag: `undefined`.
    }
  });

/**
 * The fallback parents of a canonical tag, nearest first, excluding the tag itself:
 * subtags are dropped from the right, extensions first, and a parent is kept only when
 * it maximizes to the same script (`pt-BR` → [`pt`]; `zh-HK` → []; `sr-Latn-RS` →
 * [`sr-Latn`]). The array is shared (memoized): read it, never change it.
 */
export const parents = (tag: string): readonly string[] =>
  once("p" + tag, () => {
    const script = maximize(tag).script;
    const base = new Intl.Locale(tag).baseName;
    const out: string[] = base != tag ? [base] : [];
    for (let t = base, i: number; (i = t.lastIndexOf("-")) > 0;) {
      t = t.slice(0, i);
      if (maximize(t).script == script) out.push(t);
    }
    return out;
  });

const RTL = /^(Arab|Hebr|Thaa|Syrc|Nkoo|Adlm|Rohg|Mand|Samr|Mend|Yezi)$/;

/** Text direction of a canonical tag, from the script it maximizes to. */
export const dir = (tag: string): "ltr" | "rtl" =>
  RTL.test(maximize(tag).script as string) ? "rtl" : "ltr"; // no script: tests "undefined"

/**
 * Picks the best supported locale for a list of requested ones (most preferred
 * first, e.g. `navigator.languages`). For each requested tag in order, the best
 * supported tag wins: an exact match, else the nearest parent from its chain, else one
 * of the same language and script (same region preferred; the first listed on a tie).
 * Returns the supported entry as the caller spelled it, or `fallback` when nothing
 * matches. Malformed tags on either side are ignored.
 */
export const negotiate = (
  requested: string | readonly string[],
  supported: readonly string[],
  fallback?: string,
): string | undefined => {
  for (const raw of typeof requested === "string" ? [requested] : requested) {
    const tag = canonicalize(raw);
    if (!tag) continue;
    const want = maximize(tag);
    const chain = parents(tag);
    let best: string | undefined;
    let score = 0;
    for (const given of supported) {
      const c = canonicalize(given);
      if (!c) continue;
      const have = maximize(c);
      const s =
        c == tag
          ? 99
          : chain.includes(c)
            ? 98 - chain.indexOf(c)
            : have.language == want.language && have.script == want.script
              ? have.region == want.region
                ? 2
                : 1
              : 0;
      if (s > score) {
        score = s;
        best = given;
      }
    }
    if (best) return best;
  }
  return fallback;
};

/** Test seam. */
export const _resetLocaleCache = (): void => {
  memo = new Map();
};
