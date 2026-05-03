/**
 * Shared locale resolution utilities
 */

/**
 * Resolve Accept-Language header to a supported locale.
 *
 * Matching strategy (in order):
 * 1. Exact match (e.g., "en-US" matches "en-US")
 * 2. Base language match (e.g., "en-US" matches "en")
 * 3. Prefix match — find a locale starting with the base (e.g., "en" matches "en-US")
 *
 * Languages are tried in quality-value order as specified by RFC 9110.
 */
export function resolveAcceptLanguage(
  acceptLanguage: string,
  locales: readonly string[],
): string | undefined {
  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,uk;q=0.8")
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, q = "q=1"] = lang.trim().split(";");
      const quality = parseFloat(q.split("=")[1] || "1");
      return {
        code: code.trim(),
        quality: isNaN(quality) ? 1 : quality,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { code } of languages) {
    const normalizedCode = code.toLowerCase();

    // 1. Exact match (e.g., "en-US" === "en-US")
    const exactMatch = locales.find((locale) => locale.toLowerCase() === normalizedCode);
    if (exactMatch) return exactMatch;

    // 2. Base language match (e.g., "en-US" -> "en")
    const baseLang = normalizedCode.split("-")[0];
    const baseMatch = locales.find((locale) => locale.toLowerCase() === baseLang);
    if (baseMatch) return baseMatch;

    // 3. Find locale starting with the base language (e.g., "en" -> "en-US")
    const prefixMatch = locales.find((locale) => locale.toLowerCase().startsWith(baseLang + "-"));
    if (prefixMatch) return prefixMatch;
  }

  return undefined;
}
