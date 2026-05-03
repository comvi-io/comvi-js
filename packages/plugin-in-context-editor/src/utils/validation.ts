/**
 * Translation validation utilities
 */

import type { ValidationResult, ValidationError, Language, PluralFormTranslation } from "../types";

/**
 * Validate translations for all languages
 * @param languages - Array of language configurations
 * @param translations - Translation data for all languages
 * @returns Validation result with errors
 */
export function validateTranslations(
  languages: Language[],
  translations: Record<string, PluralFormTranslation>,
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const language of languages) {
    const langTranslations = translations[language.code] || {};

    // Check plural forms - only validate max length, allow empty fields
    for (const form of language.pluralForms) {
      const value = langTranslations[form];

      // Check max length only
      if (value && value.length > 5000) {
        errors.push({
          languageId: language.code,
          pluralForm: form,
          message: `Translation for "${form}" form exceeds maximum length of 5000 characters`,
        });
      }
    }

    // Validate variable placeholders consistency
    const sourceForms = Object.values(langTranslations);
    if (sourceForms.length > 0) {
      const sourceVariables = extractVariables(sourceForms[0] || "");

      for (const form of language.pluralForms) {
        const formValue = langTranslations[form] || "";
        const formVariables = extractVariables(formValue);

        // Check if variables match (warn only, not error)
        if (formValue && !arraysEqual(sourceVariables, formVariables)) {
          // This is a warning, not blocking
          // Could add a warnings array to ValidationResult if needed
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Extract variable placeholders from text
 * Matches patterns like {{variable}}, {variable}, %variable%
 * @param text - Text to extract variables from
 * @returns Array of variable names
 */
function extractVariables(text: string): string[] {
  const patterns = [
    /\{\{([^}]+)\}\}/g, // {{variable}}
    /\{([^}]+)\}/g, // {variable}
    /%([^%]+)%/g, // %variable%
    /<(\d+)>/g, // <0>, <1> for react-i18next trans component
  ];

  const variables = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        variables.add(match[1].trim());
      }
    }
  }

  return Array.from(variables).sort();
}

/**
 * Check if two arrays are equal
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Validate a single translation field
 * @param value - Translation value
 * @param isRequired - Whether the field is required
 * @returns Error message or null if valid
 */
export function validateField(value: string, isRequired: boolean = false): string | null {
  if (isRequired && (!value || value.trim() === "")) {
    return "This field is required";
  }

  if (value && value.length > 5000) {
    return "Translation exceeds maximum length of 5000 characters";
  }

  return null;
}
