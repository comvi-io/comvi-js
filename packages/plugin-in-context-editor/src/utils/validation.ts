import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  Language,
  PluralFormTranslation,
} from "../types";

export function validateTranslations(
  languages: Language[],
  translations: Record<string, PluralFormTranslation>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const language of languages) {
    const langTranslations = translations[language.code] || {};

    // Plural forms may be empty; only the max length is enforced.
    for (const form of language.pluralForms) {
      const value = langTranslations[form];

      if (value && value.length > 5000) {
        errors.push({
          languageId: language.code,
          pluralForm: form,
          message: `Translation for "${form}" form exceeds maximum length of 5000 characters`,
        });
      }
    }

    const sourceForms = Object.values(langTranslations);
    if (sourceForms.length > 0) {
      const sourceVariables = extractVariables(sourceForms[0] || "");

      for (const form of language.pluralForms) {
        const formValue = langTranslations[form] || "";
        const formVariables = extractVariables(formValue);

        if (formValue && !arraysEqual(sourceVariables, formVariables)) {
          const missing = sourceVariables.filter((v) => !formVariables.includes(v));
          const extra = formVariables.filter((v) => !sourceVariables.includes(v));
          warnings.push({
            languageId: language.code,
            pluralForm: form,
            message:
              `Placeholders differ from the first form` +
              (missing.length ? `; missing: ${missing.join(", ")}` : "") +
              (extra.length ? `; unexpected: ${extra.join(", ")}` : ""),
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Matches `{{variable}}`, `{variable}` and `%variable%`. */
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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function validateField(value: string, isRequired: boolean = false): string | null {
  if (isRequired && (!value || value.trim() === "")) {
    return "This field is required";
  }

  if (value && value.length > 5000) {
    return "Translation exceeds maximum length of 5000 characters";
  }

  return null;
}
