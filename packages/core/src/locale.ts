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

interface Max {
  language: string;
  script: string | undefined;
  region: string | undefined;
  base: string;
}

/** Likely subtags per canonical tag: a pure function of the tag, capped like the Intl cache. */
let maxCache = new Map<string, Max>();

const maximize = (tag: string): Max => {
  let m = maxCache.get(tag);
  if (!m) {
    if (maxCache.size >= 500) maxCache = new Map();
    const loc = new Intl.Locale(tag);
    const full = loc.maximize();
    m = { language: full.language, script: full.script, region: full.region, base: loc.baseName };
    maxCache.set(tag, m);
  }
  return m;
};

/**
 * The canonical BCP 47 spelling of a tag (`en_US` → `en-US`, `EN-us` → `en-US`,
 * `iw` → `he`), or `undefined` when it is not a well-formed tag.
 */
export const canonicalize = (tag: string): string | undefined => {
  try {
    return Intl.getCanonicalLocales(tag.replace(/_/g, "-"))[0];
  } catch {
    return undefined;
  }
};

/**
 * The fallback parents of a canonical tag, nearest first, excluding the tag itself:
 * subtags are dropped from the right, extensions first, and a parent is kept only when
 * it maximizes to the same script (`pt-BR` → [`pt`]; `zh-HK` → []; `sr-Latn-RS` →
 * [`sr-Latn`]).
 */
export const parents = (tag: string): string[] => {
  const { script, base } = maximize(tag);
  const out: string[] = [];
  if (base !== tag) out.push(base);
  for (let t = base, i: number; (i = t.lastIndexOf("-")) > 0;) {
    t = t.slice(0, i);
    if (maximize(t).script === script) out.push(t);
  }
  return out;
};

const RTL = /^(Arab|Hebr|Thaa|Syrc|Nkoo|Adlm|Rohg|Mand|Samr|Mend|Yezi)$/;

/** Text direction of a canonical tag, from the script it maximizes to. */
export const dir = (tag: string): "ltr" | "rtl" =>
  RTL.test(maximize(tag).script || "") ? "rtl" : "ltr";

/**
 * Picks the best supported locale for a list of requested ones (most preferred
 * first, e.g. `navigator.languages`). For each requested tag in order: an exact
 * match, then a parent from its chain, then a supported tag of the same language and
 * script (same region preferred). Returns the supported entry as the caller spelled
 * it, or `fallback` when nothing matches. Malformed tags on either side are ignored.
 */
export const negotiate = (
  requested: string | readonly string[],
  supported: readonly string[],
  fallback?: string,
): string | undefined => {
  const pool: [given: string, canonical: string][] = [];
  for (const given of supported) {
    const canonical = canonicalize(given);
    if (canonical) pool.push([given, canonical]);
  }
  const find = (tag: string) => pool.find((entry) => entry[1] === tag);
  for (const raw of typeof requested === "string" ? [requested] : requested) {
    const tag = canonicalize(raw);
    if (!tag) continue;
    let hit = find(tag);
    for (const parent of hit ? [] : parents(tag)) if ((hit = find(parent))) break;
    if (!hit) {
      const want = maximize(tag);
      let sameRegion: [string, string] | undefined;
      for (const entry of pool) {
        const have = maximize(entry[1]);
        if (have.language === want.language && have.script === want.script) {
          hit ??= entry;
          if (have.region === want.region) sameRegion ??= entry;
        }
      }
      hit = sameRegion || hit;
    }
    if (hit) return hit[0];
  }
  return fallback;
};

/** Test seam. */
export const _resetLocaleCache = (): void => {
  maxCache = new Map();
};
