export interface PluralRuleInfo {
  categories: string[];
  explanations: Record<string, string>;
  examples: Record<string, number[]>;
}

/** `fr_FR` → `fr-FR`: Intl only accepts the hyphen form. */
function normalizeLanguageCode(languageCode: string): string {
  return languageCode.replace(/_/g, "-");
}

const pluralRulesCache = new Map<string, PluralRuleInfo>();

/** The probe set: categories are detected by classifying these numbers. */
function generateTestNumbers(): number[] {
  const numbers: number[] = [];

  for (let i = 0; i <= 30; i++) {
    numbers.push(i);
  }

  for (let i = 1; i <= 9; i++) {
    numbers.push(i * 10);
    numbers.push(i * 100);
  }

  numbers.push(1000, 10000, 100000, 1000000, 2000000);

  // Numbers ending with different digits (for Slavic languages)
  for (const base of [20, 30, 40, 100]) {
    for (let i = 0; i <= 9; i++) {
      numbers.push(base + i);
    }
  }

  const decimals = [0.0, 0.1, 0.5, 0.9, 1.0, 1.1, 1.5, 1.9, 2.0, 2.5];
  numbers.push(...decimals);

  return numbers;
}

function detectPluralRules(
  locale: string,
  categorizedNumbers: Record<string, number[]>,
): Record<string, string> {
  const normalizedLocale = normalizeLanguageCode(locale);
  const explanations: Record<string, string> = {};

  for (const [category, numbers] of Object.entries(categorizedNumbers)) {
    numbers.sort((a, b) => a - b);

    let explanation = "Used for specific numbers";

    if (category === "zero" && numbers.includes(0) && numbers.length < 3) {
      explanation = "Used when count is exactly 0";
    } else if (category === "one") {
      // Check for range pattern (0-1 inclusive, including decimals)
      if (
        numbers.includes(0) &&
        numbers.includes(1) &&
        numbers.some((n) => n > 0 && n < 1) &&
        numbers.some((n) => n > 1 && n < 2)
      ) {
        explanation = "Used when count is 0-1 inclusive (including decimals between 0-1)";
      }
      // Check if only decimals between 0-1 and 1 are included
      else if (!numbers.includes(0) && numbers.includes(1) && numbers.some((n) => n > 0 && n < 1)) {
        explanation = "Used when count is 1 or a decimal between 0-1";
      } else if (numbers.includes(1) && numbers.filter((n) => Number.isInteger(n)).length === 1) {
        explanation = "Used when count is exactly 1";
      }
      // Check for Slavic-like (ends in 1 except 11, 111, etc.)
      else if (numbers.includes(1) && numbers.includes(21) && !numbers.includes(11)) {
        explanation = "Used for numbers ending in 1 (except those ending in 11)";
      }
    } else if (category === "two" && numbers.includes(2)) {
      if (numbers.length < 3) {
        explanation = "Used when count is exactly 2";
      }
    } else if (category === "few") {
      // Slavic pattern for few (2-4 except 12-14)
      if (
        numbers.includes(2) &&
        numbers.includes(3) &&
        numbers.includes(4) &&
        numbers.includes(22) &&
        numbers.includes(23) &&
        numbers.includes(24) &&
        !numbers.includes(12) &&
        !numbers.includes(13) &&
        !numbers.includes(14)
      ) {
        explanation = "Used for numbers ending in 2-4 (except those ending in 12-14)";
      }
      // Arabic pattern
      else if (normalizedLocale.startsWith("ar") && numbers.includes(3) && numbers.includes(10)) {
        explanation = "Used for numbers 3-10";
      }
    } else if (category === "many") {
      // Slavic pattern
      if (
        numbers.includes(5) &&
        numbers.includes(6) &&
        numbers.includes(11) &&
        numbers.includes(12) &&
        numbers.includes(13)
      ) {
        explanation = "Used for numbers ending in 0 or 5-9, and numbers ending in 11-14";
      }
      // Arabic pattern
      else if (normalizedLocale.startsWith("ar") && numbers.includes(11) && numbers.includes(99)) {
        explanation = "Used for numbers 11-99";
      }
      // French millions
      else if (numbers.includes(1000000) && numbers.includes(2000000) && !numbers.includes(1)) {
        explanation = "Used for integers ≥ 1,000,000 (one million or greater)";
      }
    } else if (category === "other") {
      if (Object.keys(categorizedNumbers).length === 1) {
        explanation = "Used for all numbers (this language doesn't have distinct plural forms)";
      } else if (categorizedNumbers["one"] && categorizedNumbers["many"]) {
        explanation = "Used for numbers not covered by other forms";
      } else if (categorizedNumbers["one"] && Object.keys(categorizedNumbers).length === 2) {
        explanation = "Used for all values except those in 'one' category";
      }
    }

    explanations[category] = explanation;
  }

  return explanations;
}

const CATEGORY_ORDER = ["zero", "one", "two", "few", "many", "other"];

function categorizeNumbers(
  languageCode: string,
): { categorized: Record<string, number[]>; categories: string[] } | null {
  try {
    const normalizedCode = normalizeLanguageCode(languageCode);
    const pluralRule = new Intl.PluralRules(normalizedCode, { type: "cardinal" });
    const testNumbers = generateTestNumbers();

    const categorized: Record<string, number[]> = {};
    testNumbers.forEach((num) => {
      const cat = pluralRule.select(num);
      if (!categorized[cat]) {
        categorized[cat] = [];
      }
      if (!categorized[cat].includes(num)) {
        categorized[cat].push(num);
      }
    });

    const categories = Object.keys(categorized).sort((a, b) => {
      return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
    });

    return { categorized, categories };
  } catch (e) {
    console.error("Error categorizing numbers:", e);
    return null;
  }
}

export function detectPluralCategories(languageCode: string): string[] {
  const result = categorizeNumbers(languageCode);
  return result?.categories ?? ["other"];
}

export function usePluralRules(languageCode: string): PluralRuleInfo {
  if (pluralRulesCache.has(languageCode)) {
    return pluralRulesCache.get(languageCode)!;
  }

  const categorizeResult = categorizeNumbers(languageCode);

  if (!categorizeResult) {
    const fallback: PluralRuleInfo = {
      categories: ["other"],
      explanations: {
        other: "Used for all numbers (unable to analyze rules for this language)",
      },
      examples: {
        other: [0, 1, 2, 3, 5, 10],
      },
    };
    pluralRulesCache.set(languageCode, fallback);
    return fallback;
  }

  const { categorized, categories } = categorizeResult;
  const normalizedCode = normalizeLanguageCode(languageCode);

  const explanations = detectPluralRules(normalizedCode, categorized);

  const examples: Record<string, number[]> = {};
  for (const [category, numbers] of Object.entries(categorized)) {
    examples[category] = numbers.sort((a, b) => a - b);
  }

  const result: PluralRuleInfo = {
    categories,
    explanations,
    examples,
  };

  pluralRulesCache.set(languageCode, result);

  return result;
}

export function getPluralCategory(count: number, languageCode: string): string {
  try {
    const normalizedCode = normalizeLanguageCode(languageCode);
    const pluralRule = new Intl.PluralRules(normalizedCode, { type: "cardinal" });
    return pluralRule.select(count);
  } catch (e) {
    console.error("Error getting plural category:", e);
    return "other";
  }
}
