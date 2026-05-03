/**
 * ICU Plural Format Parser and Generator
 * Handles parsing and generating ICU MessageFormat plural syntax
 * Example: {count, plural, one {1 item} other {# items}}
 */

/**
 * Default variable name for ICU plural format
 */
export const DEFAULT_PLURAL_VARIABLE = "count";

/**
 * Validation pattern for plural variable names
 * Must be a valid JavaScript identifier (letters, digits, underscore, dollar sign)
 * Must start with a letter, underscore, or dollar sign
 */
export const PLURAL_VARIABLE_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Maximum length for plural variable names
 */
export const MAX_PLURAL_VARIABLE_LENGTH = 30;

/**
 * Result of parsing ICU plural format
 */
export interface ParsedICUPlural {
  variable: string;
  forms: Record<string, string>;
}

/**
 * Parse ICU plural format string to extract variable name and plural forms
 * @param icu - ICU format string like "{count, plural, one {text} other {text}}"
 * @returns Object with variable name and plural forms
 * @example
 * parseICUPlural("{count, plural, one {1 item} other {# items}}")
 * // Returns: { variable: "count", forms: { one: "1 item", other: "# items" } }
 */
export function parseICUPlural(icu: string): ParsedICUPlural {
  // Remove outer braces and extract content
  const content = icu.trim().replace(/^\{|\}$/g, "");

  // Extract variable name and plural section: {variable, plural, ...}
  const variableMatch = content.match(/^(\w+),\s*plural,\s*(.+)$/);
  if (!variableMatch) {
    return {
      variable: DEFAULT_PLURAL_VARIABLE,
      forms: { other: icu }, // Fallback to treating as singular
    };
  }

  const variable = variableMatch[1]!;
  const pluralSection = variableMatch[2]!;

  // Pattern to match: form {text}
  // Handles nested braces in text
  const pattern = /(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  const forms: Record<string, string> = {};

  let match;
  while ((match = pattern.exec(pluralSection)) !== null) {
    const form = match[1]!; // e.g., "one", "other", "few"
    const text = match[2]!.trim(); // The text content
    forms[form] = text;
  }

  return { variable, forms };
}

/**
 * Generate ICU plural format string from plural forms object
 * @param forms - Object with plural forms as keys and text as values
 * @param variable - Variable name to use (default: "count")
 * @returns ICU format string
 * @example
 * generateICUPlural({ one: "1 item", other: "# items" })
 * // Returns: "{count, plural, one {1 item} other {# items}}"
 */
export function generateICUPlural(
  forms: Record<string, string>,
  variable: string = "count",
): string {
  // Order forms: zero, one, two, few, many, other
  const formOrder = ["zero", "one", "two", "few", "many", "other"];

  const entries = formOrder
    .filter((form) => forms[form] !== undefined)
    .map((form) => `${form} {${forms[form]}}`)
    .join(" ");

  return `{${variable}, plural, ${entries}}`;
}

/**
 * Convert singular string to plural format
 * All plural forms will initially have the same text
 * @param text - Singular text
 * @param pluralForms - Array of plural forms for the language
 * @returns Object with all plural forms populated with same text
 */
export function singularToPlural(text: string, pluralForms: string[]): Record<string, string> {
  const forms: Record<string, string> = {};
  pluralForms.forEach((form) => {
    forms[form] = text;
  });
  return forms;
}

/**
 * Convert plural forms to singular
 * Uses the 'other' form as default, falls back to first available
 * @param forms - Plural forms object
 * @returns Singular text string
 */
export function pluralToSingular(forms: Record<string, string>): string {
  return forms.other || forms.one || Object.values(forms)[0] || "";
}

// =============================================================================
// ICU SELECT FORMAT
// =============================================================================

/**
 * Default variable name for ICU select format
 */
export const DEFAULT_SELECT_VARIABLE = "select";

/**
 * Result of parsing ICU select format
 */
export interface ParsedICUSelect {
  variable: string;
  forms: Record<string, string>;
}

/**
 * Parse ICU select format string to extract variable name and select forms
 * @param icu - ICU format string like "{gender, select, male {He} female {She} other {They}}"
 * @returns Object with variable name and select forms
 * @example
 * parseICUSelect("{gender, select, male {He} female {She} other {They}}")
 * // Returns: { variable: "gender", forms: { male: "He", female: "She", other: "They" } }
 */
export function parseICUSelect(icu: string): ParsedICUSelect {
  // Remove outer braces and extract content
  const content = icu.trim().replace(/^\{|\}$/g, "");

  // Extract variable name and select section: {variable, select, ...}
  const variableMatch = content.match(/^(\w+),\s*select,\s*(.+)$/s);
  if (!variableMatch) {
    return {
      variable: DEFAULT_SELECT_VARIABLE,
      forms: { other: icu }, // Fallback to treating as singular
    };
  }

  const variable = variableMatch[1]!;
  const selectSection = variableMatch[2]!;

  // Pattern to match: form {text}
  // Handles nested braces in text
  const forms: Record<string, string> = {};
  let remaining = selectSection.trim();

  while (remaining.length > 0) {
    // Match form name
    const formMatch = remaining.match(/^(\w+)\s*\{/);
    if (!formMatch) break;

    const formName = formMatch[1]!;
    remaining = remaining.slice(formMatch[0].length);

    // Find matching closing brace (handle nested braces)
    let depth = 1;
    let i = 0;
    while (i < remaining.length && depth > 0) {
      if (remaining[i] === "{") depth++;
      else if (remaining[i] === "}") depth--;
      i++;
    }

    const formContent = remaining.slice(0, i - 1);
    forms[formName] = formContent;
    remaining = remaining.slice(i).trim();
  }

  return { variable, forms };
}

/**
 * Generate ICU select format string from select forms object
 * @param forms - Object with select forms as keys and text as values
 * @param variable - Variable name to use (default: "select")
 * @returns ICU format string
 * @example
 * generateICUSelect({ male: "He", female: "She", other: "They" }, "gender")
 * // Returns: "{gender, select, male {He} female {She} other {They}}"
 */
export function generateICUSelect(
  forms: Record<string, string>,
  variable: string = DEFAULT_SELECT_VARIABLE,
): string {
  // Put 'other' last if it exists
  const keys = Object.keys(forms);
  const otherIndex = keys.indexOf("other");
  if (otherIndex > -1) {
    keys.splice(otherIndex, 1);
    keys.push("other");
  }

  const entries = keys.map((form) => `${form} {${forms[form]}}`).join(" ");

  return `{${variable}, select, ${entries}}`;
}

// =============================================================================
// ICU COMBINED FORMAT (SELECT + PLURAL)
// =============================================================================

/**
 * Generate ICU combined format (select wrapping plural) from nested forms
 * @param forms - Object with composite keys like "formal:one", "formal:other"
 * @param selectVariable - Variable name for select (e.g., "formality")
 * @param pluralVariable - Variable name for plural (e.g., "count")
 * @param selectOptions - Array of select options (e.g., ["formal", "informal"])
 * @param pluralForms - Array of plural forms (e.g., ["one", "other"])
 * @returns ICU format string
 * @example
 * generateICUCombined(
 *   { "formal:one": "Sie haben # Nachricht", "formal:other": "Sie haben # Nachrichten", ... },
 *   "formality", "count", ["formal", "informal"], ["one", "other"]
 * )
 * // Returns: "{formality, select, formal {{count, plural, one {Sie haben # Nachricht} other {Sie haben # Nachrichten}}} informal {...}}"
 */
export function generateICUCombined(
  forms: Record<string, string>,
  selectVariable: string,
  pluralVariable: string,
  selectOptions: string[],
  pluralForms: string[],
): string {
  const selectEntries = selectOptions
    .map((selectOpt) => {
      // Build plural forms for this select option
      const pluralFormsObj: Record<string, string> = {};
      pluralForms.forEach((pluralForm) => {
        const key = `${selectOpt}:${pluralForm}`;
        pluralFormsObj[pluralForm] = forms[key] || "";
      });

      // Generate plural ICU for this select option
      const pluralIcu = generateICUPlural(pluralFormsObj, pluralVariable);

      return `${selectOpt} {${pluralIcu}}`;
    })
    .join(" ");

  return `{${selectVariable}, select, ${selectEntries}}`;
}

/**
 * Parse combined ICU format to extract forms with composite keys
 * @param icu - ICU format string with nested select and plural
 * @returns Object with selectVariable, pluralVariable, and forms with composite keys
 */
export function parseICUCombined(icu: string): {
  selectVariable: string;
  pluralVariable: string;
  forms: Record<string, string>;
} {
  // First parse as select
  const selectParsed = parseICUSelect(icu);

  const result: Record<string, string> = {};
  let pluralVariable = DEFAULT_PLURAL_VARIABLE;

  // For each select option, parse the inner plural
  Object.entries(selectParsed.forms).forEach(([selectKey, innerIcu]) => {
    // Check if inner content is a plural
    if (detectICUType(innerIcu) === "plural") {
      const pluralParsed = parseICUPlural(innerIcu);
      pluralVariable = pluralParsed.variable;

      // Create composite keys
      Object.entries(pluralParsed.forms).forEach(([pluralKey, value]) => {
        result[`${selectKey}:${pluralKey}`] = value;
      });
    } else {
      // Not a plural inside, just store as-is
      result[`${selectKey}:other`] = innerIcu;
    }
  });

  return {
    selectVariable: selectParsed.variable,
    pluralVariable,
    forms: result,
  };
}

// =============================================================================
// ICU TYPE DETECTION
// =============================================================================

/**
 * ICU message types
 */
export type ICUType = "singular" | "plural" | "select" | "combined";

/**
 * Detect the type of ICU message format
 * @param icu - ICU format string to analyze
 * @returns The detected type: singular, plural, select, or combined
 */
export function detectICUType(icu: string): ICUType {
  // Check for ICU format patterns (must be actual ICU syntax, not just text)
  const pluralPattern = /\{\s*\w+\s*,\s*plural\s*,/;
  const selectPattern = /\{\s*\w+\s*,\s*select\s*,/;

  const hasPlural = pluralPattern.test(icu);
  const hasSelect = selectPattern.test(icu);

  if (hasPlural && hasSelect) return "combined";
  if (hasPlural) return "plural";
  if (hasSelect) return "select";
  return "singular";
}
