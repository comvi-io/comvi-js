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
import { apiFetch } from "./apiClient";

export class DemoModeError extends Error {
  constructor(operation: string) {
    super(
      `[Demo Mode] ${operation} is not available. Please configure an API key to enable this feature.`,
    );
    this.name = "DemoModeError";
  }
}

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

/** The value a save sends for one language; also the round-trip check on load. */
function generateLanguageValue(
  forms: PluralFormTranslation,
  isPlural: boolean,
  pluralVariable: string | undefined,
  selectConfig: LanguageSelectConfig | undefined,
): string {
  if (isPlural && selectConfig?.enabled) {
    // Select wrapping plural: forms carry composite keys like
    // "formal:one" / "formal:other", split apart here.
    const pluralFormsSet = new Set<string>();
    Object.keys(forms).forEach((key) => {
      const parts = key.split(":");
      if (parts.length === 2) {
        if (parts[1]) pluralFormsSet.add(parts[1]);
      }
    });
    const pluralForms = Array.from(pluralFormsSet);

    return generateICUCombined(
      forms,
      selectConfig.variable || DEFAULT_SELECT_VARIABLE,
      pluralVariable || DEFAULT_PLURAL_VARIABLE,
      selectConfig.options,
      pluralForms.length > 0 ? pluralForms : ["one", "other"],
    );
  }
  if (isPlural) {
    return generateICUPlural(forms, pluralVariable || DEFAULT_PLURAL_VARIABLE);
  }
  if (selectConfig?.enabled) {
    return generateICUSelect(forms, selectConfig.variable || DEFAULT_SELECT_VARIABLE);
  }
  return forms.other || "";
}

function transformApiResponse(
  apiData: ApiTranslationResponse,
  keyFallback?: string,
): TranslationData {
  const transformedTranslations: Record<string, PluralFormTranslation> = {};
  const selectConfigs: Record<string, LanguageSelectConfig> = {};
  const sourceValues: Record<string, string> = {};
  const rawLanguages: string[] = [];
  let pluralVariable: string | undefined;
  let hasPluralData = apiData.isPlural;

  const parsedByLanguage = Object.entries(apiData.translations).map(([langCode, translation]) => {
    const parsed = parseLanguageValue(translation.value);
    sourceValues[langCode] = translation.value;
    // Structured editing only for what the save would rebuild byte for byte:
    // exact selectors, offsets, other nestings and surrounding text are not.
    const lossless =
      generateLanguageValue(
        parsed.forms,
        parsed.isPlural,
        parsed.pluralVariable,
        parsed.selectConfig,
      ) === translation.value;
    if (lossless && parsed.isPlural) {
      hasPluralData = true;
      pluralVariable ??= parsed.pluralVariable;
    }
    return { langCode, value: translation.value, parsed, lossless };
  });

  for (const { langCode, value, parsed, lossless } of parsedByLanguage) {
    // A save rebuilds every structured language with the key's plural flag and
    // variable, so one that differs from them is not rebuilt exactly either.
    // Plain text stays plain text; it is not sent while unedited.
    const structured =
      !parsed.isPlural && !parsed.selectConfig
        ? true
        : lossless &&
          generateLanguageValue(
            parsed.forms,
            hasPluralData,
            pluralVariable,
            parsed.selectConfig,
          ) === value;

    if (!structured) {
      rawLanguages.push(langCode);
      transformedTranslations[langCode] = { other: value };
      continue;
    }
    transformedTranslations[langCode] = parsed.forms;
    if (parsed.selectConfig) {
      selectConfigs[langCode] = parsed.selectConfig;
    }
  }

  return {
    key: keyFallback ?? apiData.key,
    description: apiData.description,
    isPlural: hasPluralData,
    pluralVariable: hasPluralData ? pluralVariable : undefined,
    translations: transformedTranslations,
    selectConfigs: Object.keys(selectConfigs).length > 0 ? selectConfigs : undefined,
    rawLanguages: rawLanguages.length > 0 ? rawLanguages : undefined,
    sourceValues,
    metadata: {
      createdAt: apiData.createdAt,
      lastModified: apiData.updatedAt,
    },
  };
}

/**
 * Returns null in demo mode. A key the server does not know (404) comes back
 * as an empty singular record, so the editor can create it on save.
 */
export async function getTranslation(
  key: string,
  ns: string,
  scopeId?: string,
): Promise<TranslationData | null> {
  if (isDemoMode(scopeId)) {
    return null;
  }

  try {
    const response = await apiFetch(
      scopeId,
      `/v1/keys/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`,
      { method: "GET" },
    );

    if (response.status === 404) {
      // Missing key: hand back an empty singular structure to edit into.
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
    console.error("[@comvi/plugin-in-context-editor] Error fetching translation:", error);
    throw new Error("Failed to fetch translation");
  }
}

/**
 * @param pluralVariable - Variable name for the ICU plural format (e.g. "count")
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @param translations - Only the languages to write; each one written is set to not reviewed.
 * @param verbatim - Languages sent exactly as given instead of being generated
 *   from their forms (ICU the fields cannot rebuild).
 * @param stored - Values the server holds; a language that would be written unchanged is skipped.
 */
export async function saveTranslation(
  key: string,
  ns: string,
  translations: Record<string, PluralFormTranslation>,
  isPlural: boolean,
  pluralVariable?: string,
  selectConfigs?: Record<string, LanguageSelectConfig>,
  scopeId?: string,
  verbatim?: Record<string, string>,
  stored?: Record<string, string>,
): Promise<TranslationData> {
  if (isDemoMode(scopeId)) {
    throw new DemoModeError("Saving translations");
  }

  try {
    const apiTranslations: Record<string, { value: string; status: string }> = {};
    Object.entries(translations).forEach(([langCode, forms]) => {
      const value =
        verbatim?.[langCode] ??
        generateLanguageValue(forms, isPlural, pluralVariable, selectConfigs?.[langCode]);
      if (value !== stored?.[langCode]) {
        apiTranslations[langCode] = { value, status: "not_reviewed" };
      }
    });

    const payload = {
      key: key,
      namespace: ns,
      isPlural: isPlural,
      translations: apiTranslations,
    };

    const response = await apiFetch(scopeId, "/v1/keys", {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const apiData: ApiTranslationResponse = await response.json();

    return transformApiResponse(apiData, key);
  } catch (error) {
    console.error("[@comvi/plugin-in-context-editor] Error saving translation:", error);
    throw new Error("Failed to save translation");
  }
}

/** @param scopeId - Optional runtime scope used to isolate editor instances */
export async function deleteTranslation(key: string, ns: string, scopeId?: string): Promise<void> {
  if (isDemoMode(scopeId)) {
    throw new DemoModeError("Deleting translations");
  }

  try {
    const response = await apiFetch(
      scopeId,
      `/v1/keys/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("[@comvi/plugin-in-context-editor] Error deleting translation:", error);
    throw new Error("Failed to delete translation");
  }
}

/** @param scopeId - Optional runtime scope used to isolate editor instances */
export async function getAllTranslationKeys(scopeId?: string): Promise<(string | number)[]> {
  if (isDemoMode(scopeId)) {
    return [];
  }

  try {
    const response = await apiFetch(scopeId, "/v1/translations", { method: "GET" });

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
    console.error("[@comvi/plugin-in-context-editor] Error getting translation keys:", error);
    return [];
  }
}
