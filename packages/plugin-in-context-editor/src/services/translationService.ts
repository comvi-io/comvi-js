/**
 * Translation Service
 * Handles fetching and saving translations via API
 */

import type { TranslationData, PluralFormTranslation, LanguageSelectConfig } from "../types";
import { isDemoMode } from "../config/api";
import {
  parseICUPlural,
  generateICUPlural,
  DEFAULT_PLURAL_VARIABLE,
  parseICUSelect,
  generateICUSelect,
  generateICUCombined,
  parseICUCombined,
  detectICUType,
  DEFAULT_SELECT_VARIABLE,
} from "../utils/icuParser";
import { getHeaders, getBaseUrl } from "./apiClient";

/**
 * Demo mode error class
 */
export class DemoModeError extends Error {
  constructor(operation: string) {
    super(
      `[Demo Mode] ${operation} is not available. Please configure an API key to enable this feature.`,
    );
    this.name = "DemoModeError";
  }
}

/**
 * API Response type from server
 */
interface ApiTranslationResponse {
  id: number;
  key: string;
  description?: string;
  namespaceId: number;
  isPlural: boolean;
  namespace: string;
  createdAt: string;
  updatedAt: string;
  translations: {
    [languageCode: string]: {
      id: number;
      value: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      createdBy: number;
      reviewedBy: number;
    };
  };
}

function extractSelectOptionsFromCompositeForms(forms: Record<string, string>): string[] {
  const options = new Set<string>();
  Object.keys(forms).forEach((compositeKey) => {
    const separatorIndex = compositeKey.indexOf(":");
    if (separatorIndex <= 0) {
      return;
    }
    options.add(compositeKey.slice(0, separatorIndex));
  });
  return Array.from(options);
}

function parseLanguageValue(value: string): {
  forms: PluralFormTranslation;
  isPlural: boolean;
  pluralVariable?: string;
  selectConfig?: LanguageSelectConfig;
} {
  const icuType = detectICUType(value);

  if (icuType === "combined") {
    const parsed = parseICUCombined(value);
    return {
      forms: parsed.forms,
      isPlural: true,
      pluralVariable: parsed.pluralVariable,
      selectConfig: {
        enabled: true,
        variable: parsed.selectVariable,
        options: extractSelectOptionsFromCompositeForms(parsed.forms),
      },
    };
  }

  if (icuType === "plural") {
    const parsed = parseICUPlural(value);
    return {
      forms: parsed.forms,
      isPlural: true,
      pluralVariable: parsed.variable,
    };
  }

  if (icuType === "select") {
    const parsed = parseICUSelect(value);
    return {
      forms: parsed.forms,
      isPlural: false,
      selectConfig: {
        enabled: true,
        variable: parsed.variable,
        options: Object.keys(parsed.forms),
      },
    };
  }

  return {
    forms: {
      other: value,
    },
    isPlural: false,
  };
}

function transformApiResponse(
  apiData: ApiTranslationResponse,
  keyFallback?: string,
): TranslationData {
  const transformedTranslations: Record<string, PluralFormTranslation> = {};
  const selectConfigs: Record<string, LanguageSelectConfig> = {};
  let pluralVariable: string | undefined;
  let hasPluralData = apiData.isPlural;

  Object.entries(apiData.translations).forEach(([langCode, translation]) => {
    const parsed = parseLanguageValue(translation.value);
    transformedTranslations[langCode] = parsed.forms;

    if (parsed.isPlural) {
      hasPluralData = true;
      if (!pluralVariable && parsed.pluralVariable) {
        pluralVariable = parsed.pluralVariable;
      }
    }

    if (parsed.selectConfig) {
      selectConfigs[langCode] = parsed.selectConfig;
    }
  });

  return {
    key: keyFallback ?? apiData.key,
    description: apiData.description,
    isPlural: hasPluralData,
    pluralVariable: hasPluralData ? pluralVariable : undefined,
    translations: transformedTranslations,
    selectConfigs: Object.keys(selectConfigs).length > 0 ? selectConfigs : undefined,
    metadata: {
      createdAt: apiData.createdAt,
      lastModified: apiData.updatedAt,
    },
  };
}

/**
 * Get translation data by key and namespace
 * @param key - Translation key
 * @param ns - Namespace for the translation key
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Translation data or null if not found
 */
export async function getTranslation(
  key: string,
  ns: string,
  scopeId?: string,
): Promise<TranslationData | null> {
  // In demo mode, return null - the UI will show a simplified view
  if (isDemoMode(scopeId)) {
    return null;
  }

  try {
    const baseUrl = getBaseUrl(scopeId);

    const response = await fetch(
      `${baseUrl}/v1/keys/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: getHeaders(scopeId),
      },
    );

    if (response.status === 404) {
      // Return empty translation structure for missing keys (default to singular)
      return {
        key: key,
        isPlural: false,
        translations: {},
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const apiData: ApiTranslationResponse = await response.json();

    return transformApiResponse(apiData, key);
  } catch (error) {
    console.error("Error fetching translation:", error);
    throw new Error("Failed to fetch translation");
  }
}

/**
 * Save translation data
 * @param key - Translation key
 * @param ns - Namespace for the translation key
 * @param translations - Translation data to save
 * @param isPlural - Whether the translation uses plural forms
 * @param pluralVariable - Variable name for ICU plural format (e.g., "count", "n")
 * @param selectConfigs - Per-language select configurations
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Saved translation data
 */
export async function saveTranslation(
  key: string,
  ns: string,
  translations: Record<string, PluralFormTranslation>,
  isPlural: boolean,
  pluralVariable?: string,
  selectConfigs?: Record<string, LanguageSelectConfig>,
  scopeId?: string,
): Promise<TranslationData> {
  // In demo mode, throw an error to prevent saving
  if (isDemoMode(scopeId)) {
    throw new DemoModeError("Saving translations");
  }

  try {
    const baseUrl = getBaseUrl(scopeId);

    // Transform translations to match API format
    const apiTranslations: Record<string, { value: string; status: string }> = {};
    Object.entries(translations).forEach(([langCode, forms]) => {
      const selectConfig = selectConfigs?.[langCode];

      if (isPlural && selectConfig?.enabled) {
        // Combined: select wrapping plural
        // Forms have composite keys like "formal:one", "formal:other"
        // Extract plural forms from composite keys
        const pluralFormsSet = new Set<string>();
        Object.keys(forms).forEach((key) => {
          const parts = key.split(":");
          if (parts.length === 2) {
            if (parts[1]) pluralFormsSet.add(parts[1]);
          }
        });
        const pluralForms = Array.from(pluralFormsSet);

        apiTranslations[langCode] = {
          value: generateICUCombined(
            forms,
            selectConfig.variable || DEFAULT_SELECT_VARIABLE,
            pluralVariable || DEFAULT_PLURAL_VARIABLE,
            selectConfig.options,
            pluralForms.length > 0 ? pluralForms : ["one", "other"],
          ),
          status: "not_reviewed",
        };
      } else if (isPlural) {
        // Plural only: Generate ICU format from plural forms
        apiTranslations[langCode] = {
          value: generateICUPlural(forms, pluralVariable || DEFAULT_PLURAL_VARIABLE),
          status: "not_reviewed",
        };
      } else if (selectConfig?.enabled) {
        // Select only: Generate ICU select format
        apiTranslations[langCode] = {
          value: generateICUSelect(forms, selectConfig.variable || DEFAULT_SELECT_VARIABLE),
          status: "not_reviewed",
        };
      } else {
        // Singular: just send the 'other' form value
        apiTranslations[langCode] = {
          value: forms.other || "",
          status: "not_reviewed",
        };
      }
    });

    const payload = {
      key: key,
      namespace: ns,
      isPlural: isPlural,
      translations: apiTranslations,
    };

    const response = await fetch(`${baseUrl}/v1/keys`, {
      method: "PUT",
      headers: getHeaders(scopeId),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const apiData: ApiTranslationResponse = await response.json();

    return transformApiResponse(apiData, key);
  } catch (error) {
    console.error("Error saving translation:", error);
    throw new Error("Failed to save translation");
  }
}

/**
 * Delete translation data
 * @param key - Translation key
 * @param ns - Namespace for the translation key
 * @param scopeId - Optional runtime scope used to isolate editor instances
 */
export async function deleteTranslation(key: string, ns: string, scopeId?: string): Promise<void> {
  // In demo mode, throw an error to prevent deletion
  if (isDemoMode(scopeId)) {
    throw new DemoModeError("Deleting translations");
  }

  try {
    const baseUrl = getBaseUrl(scopeId);
    const response = await fetch(
      `${baseUrl}/v1/keys/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: getHeaders(scopeId),
      },
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error deleting translation:", error);
    throw new Error("Failed to delete translation");
  }
}

/**
 * Get all translation keys
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Array of translation keys
 */
export async function getAllTranslationKeys(scopeId?: string): Promise<(string | number)[]> {
  // In demo mode, return empty array
  if (isDemoMode(scopeId)) {
    return [];
  }

  try {
    const baseUrl = getBaseUrl(scopeId);
    const response = await fetch(`${baseUrl}/v1/translations`, {
      method: "GET",
      headers: getHeaders(scopeId),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      namespaces?: Record<string, Record<string, Record<string, string>>>;
    };
    const keys = new Set<string>();
    for (const localeMap of Object.values(data.namespaces ?? {})) {
      for (const translations of Object.values(localeMap)) {
        for (const key of Object.keys(translations)) {
          keys.add(key);
        }
      }
    }

    return Array.from(keys).sort();
  } catch (error) {
    console.error("Error getting translation keys:", error);
    return [];
  }
}
