/**
 * ICU Plural Format Parser and Generator
 * Handles parsing and generating ICU MessageFormat plural syntax
 * Example: {count, plural, one {1 item} other {# items}}
 */

export const DEFAULT_PLURAL_VARIABLE = "count";

/** A plural variable name must be a valid JavaScript identifier. */
export const PLURAL_VARIABLE_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export const MAX_PLURAL_VARIABLE_LENGTH = 30;

export interface ParsedICUPlural {
  variable: string;
  forms: Record<string, string>;
}

/**
 * @example
 * parseICUPlural("{count, plural, one {1 item} other {# items}}")
 * // Returns: { variable: "count", forms: { one: "1 item", other: "# items" } }
 */
export function parseICUPlural(icu: string): ParsedICUPlural {
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

/** Every plural form starts out holding the same text. */
export function singularToPlural(text: string, pluralForms: string[]): Record<string, string> {
  const forms: Record<string, string> = {};
  pluralForms.forEach((form) => {
    forms[form] = text;
  });
  return forms;
}

/** Prefers the `other` form, falling back to the first one present. */
export function pluralToSingular(forms: Record<string, string>): string {
  return forms.other || forms.one || Object.values(forms)[0] || "";
}

export const DEFAULT_SELECT_VARIABLE = "select";

export interface ParsedICUSelect {
  variable: string;
  forms: Record<string, string>;
}

/**
 * @example
 * parseICUSelect("{gender, select, male {He} female {She} other {They}}")
 * // Returns: { variable: "gender", forms: { male: "He", female: "She", other: "They" } }
 */
export function parseICUSelect(icu: string): ParsedICUSelect {
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

    // `i - 1` excludes the matched closing brace; when the scan ran off the end of an
    // unbalanced arm there is no brace to exclude, so the full text is the arm.
    const formContent = remaining.slice(0, depth === 0 ? i - 1 : i);
    forms[formName] = formContent;
    remaining = remaining.slice(i).trim();
  }

  return { variable, forms };
}

/**
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

/**
 * Select wrapping plural.
 *
 * @param forms - Object with composite keys like "formal:one", "formal:other"
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
      const pluralFormsObj: Record<string, string> = {};
      pluralForms.forEach((pluralForm) => {
        const key = `${selectOpt}:${pluralForm}`;
        pluralFormsObj[pluralForm] = forms[key] || "";
      });

      const pluralIcu = generateICUPlural(pluralFormsObj, pluralVariable);

      return `${selectOpt} {${pluralIcu}}`;
    })
    .join(" ");

  return `{${selectVariable}, select, ${selectEntries}}`;
}

/** Inverse of {@link generateICUCombined}: forms come back composite-keyed. */
export function parseICUCombined(icu: string): {
  selectVariable: string;
  pluralVariable: string;
  forms: Record<string, string>;
} {
  const selectParsed = parseICUSelect(icu);

  const result: Record<string, string> = {};
  let pluralVariable = DEFAULT_PLURAL_VARIABLE;

  Object.entries(selectParsed.forms).forEach(([selectKey, innerIcu]) => {
    if (detectICUType(innerIcu) === "plural") {
      const pluralParsed = parseICUPlural(innerIcu);
      pluralVariable = pluralParsed.variable;

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

export type ICUType = "singular" | "plural" | "select" | "combined";

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
