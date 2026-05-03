/**
 * Translation state management composable
 * Manages loading, saving, and updating translations
 */

import { ref, computed, unref, type MaybeRef, type Ref } from "vue";
import type {
  TranslationData,
  TranslationState,
  Language,
  ValidationResult,
  LanguageSelectConfig,
} from "../types";
import {
  getTranslation,
  saveTranslation as saveTranslationService,
} from "../services/translationService";
import { validateTranslations } from "../utils/validation";
import {
  singularToPlural,
  pluralToSingular,
  generateICUPlural,
  generateICUSelect,
  generateICUCombined,
  DEFAULT_PLURAL_VARIABLE,
  DEFAULT_SELECT_VARIABLE,
  PLURAL_VARIABLE_PATTERN,
  MAX_PLURAL_VARIABLE_LENGTH,
} from "../utils/icuParser";
import { getI18nInstance } from "../Core";

/**
 * Composable for managing translation state
 * @param languages - Reactive ref of language configurations for validation
 * @param instanceId - Optional i18n instance ID to scope runtime cache updates
 */
export function useTranslations(
  languages: Ref<Language[]>,
  instanceId?: MaybeRef<string | undefined>,
) {
  // State
  const state = ref<TranslationState>({
    data: null,
    isLoading: false,
    error: null,
    isDirty: false,
  });
  // Snapshot of translations at last load/save — used to flag fields that differ
  // from the persisted state (true "unsaved" indicator).
  const baselineTranslations = ref<Record<string, Record<string, string>> | null>(null);
  let latestLoadRequestId = 0;

  function snapshotTranslations(
    translations: Record<string, Record<string, string>>,
  ): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [lang, forms] of Object.entries(translations)) {
      out[lang] = { ...forms };
    }
    return out;
  }

  // Track namespace separately
  const currentNamespace = ref<string>("");

  // Computed properties
  const currentKey = computed(() => state.value.data?.key);
  const description = computed(() => state.value.data?.description ?? "");
  const translations = computed(() => state.value.data?.translations || {});
  const hasUnsavedChanges = computed(() => state.value.isDirty);
  const isPlural = computed(() => state.value.data?.isPlural ?? false);
  const pluralVariable = computed(() => state.value.data?.pluralVariable ?? "");
  const selectConfigs = computed(() => state.value.data?.selectConfigs || {});

  /**
   * Load translation data by key and namespace
   * @param key - Translation key to load
   * @param ns - Namespace for the translation key
   */
  async function loadTranslation(key: string, ns: string): Promise<void> {
    const requestId = ++latestLoadRequestId;
    state.value = {
      data: null,
      isLoading: true,
      error: null,
      isDirty: false,
    };
    currentNamespace.value = ns;

    try {
      const data = await getTranslation(key, ns, unref(instanceId));
      if (requestId !== latestLoadRequestId) {
        return;
      }
      if (!data) {
        state.value.data = null;
        state.value.isDirty = false;
        baselineTranslations.value = null;
        return;
      }
      state.value.data = data;
      state.value.isDirty = false;
      baselineTranslations.value = snapshotTranslations(data.translations);
    } catch (error) {
      if (requestId !== latestLoadRequestId) {
        return;
      }
      state.value.error = error instanceof Error ? error.message : "Failed to load translation";
      console.error("Error loading translation:", error);
    } finally {
      if (requestId === latestLoadRequestId) {
        state.value.isLoading = false;
      }
    }
  }

  /**
   * Update i18n runtime cache with saved translation
   * This ensures the UI updates immediately without page reload
   */
  function updateRuntimeCache(data: TranslationData, namespace: string): void {
    const i18n = getI18nInstance(unref(instanceId));
    if (!i18n) {
      console.warn("[InContextEditor] Cannot update runtime cache: i18n instance not available");
      return;
    }

    // Use "lang:namespace" format as key, which addTranslations expects
    const translationsToAdd: Record<string, Record<string, string>> = {};

    // Convert saved data to i18n format
    Object.entries(data.translations).forEach(([langCode, forms]) => {
      const cacheKey = `${langCode}:${namespace}`;
      if (!translationsToAdd[cacheKey]) {
        translationsToAdd[cacheKey] = {};
      }

      const selectConfig = data.selectConfigs?.[langCode];

      if (data.isPlural && selectConfig?.enabled) {
        // Combined: select wrapping plural
        // Forms have composite keys like "formal:one", "formal:other"
        const lang = languages.value.find((l) => l.code === langCode);
        const pluralForms = lang?.pluralForms || ["one", "other"];

        const icuFormat = generateICUCombined(
          forms,
          selectConfig.variable || DEFAULT_SELECT_VARIABLE,
          data.pluralVariable || DEFAULT_PLURAL_VARIABLE,
          selectConfig.options,
          pluralForms,
        );
        translationsToAdd[cacheKey][String(data.key)] = icuFormat;
      } else if (data.isPlural) {
        // Plural only
        const icuFormat = generateICUPlural(forms, data.pluralVariable || DEFAULT_PLURAL_VARIABLE);
        translationsToAdd[cacheKey][String(data.key)] = icuFormat;
      } else if (selectConfig?.enabled) {
        // Select only
        const icuFormat = generateICUSelect(
          forms,
          selectConfig.variable || DEFAULT_SELECT_VARIABLE,
        );
        translationsToAdd[cacheKey][String(data.key)] = icuFormat;
      } else {
        // Singular translation
        translationsToAdd[cacheKey][String(data.key)] = forms.other || "";
      }
    });

    // Update i18n cache
    i18n.addTranslations(translationsToAdd);
  }

  /**
   * Save current translation data
   * @returns Saved translation data or null if failed
   */
  async function saveTranslation(): Promise<TranslationData | null> {
    if (!state.value.data) {
      state.value.error = "No translation data to save";
      return null;
    }

    if (!currentNamespace.value || currentNamespace.value.trim() === "") {
      state.value.error = "No namespace set. Please ensure the translation has a valid namespace.";
      console.error("Save failed: namespace is", currentNamespace.value);
      return null;
    }

    // Validate before saving
    const validationResult = validate();
    if (!validationResult.isValid) {
      state.value.error = `Validation failed: ${validationResult.errors
        .map((e) => e.message)
        .join(", ")}`;
      return null;
    }

    state.value.isLoading = true;
    state.value.error = null;

    try {
      const savedData = await saveTranslationService(
        String(state.value.data.key),
        currentNamespace.value,
        state.value.data.translations,
        state.value.data.isPlural,
        state.value.data.pluralVariable,
        state.value.data.selectConfigs,
        unref(instanceId),
      );
      state.value.data = savedData;
      state.value.isDirty = false;
      baselineTranslations.value = snapshotTranslations(savedData.translations);

      // Update i18n runtime cache immediately
      updateRuntimeCache(savedData, currentNamespace.value);

      return savedData;
    } catch (error) {
      state.value.error = error instanceof Error ? error.message : "Failed to save translation";
      console.error("Error saving translation:", error);
      return null;
    } finally {
      state.value.isLoading = false;
    }
  }

  /**
   * Update a specific translation field
   * @param languageCode - Language code (e.g., "en", "fr")
   * @param pluralForm - Plural form (e.g., "one", "other")
   * @param value - Translation value
   */
  function updateTranslation(languageCode: string, pluralForm: string, value: string): void {
    if (!state.value.data) {
      console.warn("Cannot update translation: no data loaded");
      return;
    }

    // Initialize language translations if not exists
    if (!state.value.data.translations[languageCode]) {
      state.value.data.translations[languageCode] = {};
    }

    // Update the specific plural form
    state.value.data.translations[languageCode][pluralForm] = value;

    // Mark as dirty
    state.value.isDirty = true;
  }

  /**
   * Validate current translations
   * @returns Validation result
   */
  function validate(): ValidationResult {
    if (!state.value.data) {
      return {
        isValid: false,
        errors: [
          {
            languageId: "",
            pluralForm: "",
            message: "No translation data to validate",
          },
        ],
      };
    }

    // Validate translations
    const translationValidation = validateTranslations(
      languages.value,
      state.value.data.translations,
    );

    // Validate plural variable if in plural mode
    if (state.value.data.isPlural) {
      const variable = state.value.data.pluralVariable;

      if (!variable || variable.trim() === "") {
        translationValidation.errors.push({
          languageId: "",
          pluralForm: "",
          message: "Plural variable name is required",
        });
        translationValidation.isValid = false;
      } else if (variable.length > MAX_PLURAL_VARIABLE_LENGTH) {
        translationValidation.errors.push({
          languageId: "",
          pluralForm: "",
          message: `Plural variable name must be ${MAX_PLURAL_VARIABLE_LENGTH} characters or less`,
        });
        translationValidation.isValid = false;
      } else if (!PLURAL_VARIABLE_PATTERN.test(variable)) {
        translationValidation.errors.push({
          languageId: "",
          pluralForm: "",
          message: "Plural variable name must be a valid identifier",
        });
        translationValidation.isValid = false;
      }
    }

    return translationValidation;
  }

  /**
   * Reset state to initial values
   */
  function resetState(): void {
    state.value = {
      data: null,
      isLoading: false,
      error: null,
      isDirty: false,
    };
    baselineTranslations.value = null;
  }

  /**
   * Check whether a translation field differs from its last-saved value.
   * Used to render an unsaved-changes indicator.
   */
  function isFieldDirty(languageCode: string, formKey: string): boolean {
    const baseline = baselineTranslations.value;
    if (!baseline) return false;
    const current = state.value.data?.translations?.[languageCode]?.[formKey] ?? "";
    const original = baseline[languageCode]?.[formKey] ?? "";
    return current !== original;
  }

  /**
   * Update metadata fields
   * @param metadata - Partial metadata to merge
   */
  function updateMetadata(metadata: Partial<TranslationData["metadata"]>): void {
    if (!state.value.data) {
      console.warn("Cannot update metadata: no data loaded");
      return;
    }

    state.value.data.metadata = {
      ...state.value.data.metadata,
      ...metadata,
    };

    state.value.isDirty = true;
  }

  /**
   * Update plural variable name
   * @param variable - Variable name for ICU plural format (e.g., "count", "n")
   */
  function updatePluralVariable(variable: string): void {
    if (!state.value.data) {
      console.warn("Cannot update plural variable: no data loaded");
      return;
    }

    // Store the value as-is (validation will catch empty values)
    state.value.data.pluralVariable = variable;
    state.value.isDirty = true;
  }

  /**
   * Toggle between singular and plural modes with automatic data conversion
   * @param enabled - Whether to enable plural mode
   */
  function togglePluralMode(enabled: boolean): void {
    if (!state.value.data) {
      console.warn("Cannot toggle plural mode: no data loaded");
      return;
    }

    state.value.data.isPlural = enabled;

    // Initialize plural variable if enabling plural mode and not set
    if (enabled && !state.value.data.pluralVariable) {
      state.value.data.pluralVariable = DEFAULT_PLURAL_VARIABLE;
    }

    // Convert translations for each language
    Object.keys(state.value.data.translations).forEach((langCode) => {
      const lang = languages.value.find((l) => l.code === langCode);
      if (!lang) return;

      if (enabled) {
        // Singular → Plural: Convert to all plural forms
        const singular = state.value.data!.translations[langCode]?.other || "";
        state.value.data!.translations[langCode] = singularToPlural(singular, lang.pluralForms);
      } else {
        // Plural → Singular: Use 'other' form
        const plural = state.value.data!.translations[langCode];
        state.value.data!.translations[langCode] = {
          other: pluralToSingular(plural || {}),
        };
      }
    });

    state.value.isDirty = true;
  }

  /**
   * Toggle select mode for a specific language
   * @param langCode - Language code (e.g., "de")
   * @param enabled - Whether to enable select mode
   * @param config - Optional initial config (variable, options)
   */
  function toggleSelectMode(
    langCode: string,
    enabled: boolean,
    config?: { variable: string; options: string[] },
  ): void {
    if (!state.value.data) {
      console.warn("Cannot toggle select mode: no data loaded");
      return;
    }

    // Initialize selectConfigs if not exists
    if (!state.value.data.selectConfigs) {
      state.value.data.selectConfigs = {};
    }

    if (enabled) {
      const variable = config?.variable || DEFAULT_SELECT_VARIABLE;
      const options = config?.options || ["formal", "informal"];

      // Store select config
      state.value.data.selectConfigs[langCode] = {
        enabled: true,
        variable,
        options,
      };

      // Convert singular to select forms
      const currentValue = state.value.data.translations[langCode]?.other || "";
      const selectForms: Record<string, string> = {};
      options.forEach((opt) => {
        selectForms[opt] = currentValue;
      });
      state.value.data.translations[langCode] = selectForms;
    } else {
      // Disable select for this language
      if (state.value.data.selectConfigs[langCode]) {
        state.value.data.selectConfigs[langCode].enabled = false;
      }

      // Convert select forms back to singular (use first form value)
      const forms = state.value.data.translations[langCode];
      const firstValue = Object.values(forms || {})[0] || "";
      state.value.data.translations[langCode] = { other: firstValue };
    }

    state.value.isDirty = true;
  }

  /**
   * Update select config for a specific language
   * @param langCode - Language code
   * @param config - Partial config to update
   */
  function updateSelectConfig(langCode: string, config: Partial<LanguageSelectConfig>): void {
    if (!state.value.data) {
      console.warn("Cannot update select config: no data loaded");
      return;
    }

    if (!state.value.data.selectConfigs) {
      state.value.data.selectConfigs = {};
    }

    const existing = state.value.data.selectConfigs[langCode] || {
      enabled: false,
      variable: DEFAULT_SELECT_VARIABLE,
      options: [],
    };

    state.value.data.selectConfigs[langCode] = {
      ...existing,
      ...config,
    };

    // If options changed, update translations structure
    if (config.options && existing.options.join(",") !== config.options.join(",")) {
      const currentForms = state.value.data.translations[langCode] || {};
      const firstExistingValue = Object.values(currentForms).find(
        (value): value is string => typeof value === "string",
      );
      const fallbackValue = currentForms.other ?? firstExistingValue ?? "";
      const newForms: Record<string, string> = {};
      config.options.forEach((opt) => {
        newForms[opt] = currentForms[opt] ?? fallbackValue;
      });
      state.value.data.translations[langCode] = newForms;
    }

    state.value.isDirty = true;
  }

  /**
   * Get select config for a specific language
   * @param langCode - Language code
   * @returns Select config or undefined
   */
  function getSelectConfig(langCode: string): LanguageSelectConfig | undefined {
    return state.value.data?.selectConfigs?.[langCode];
  }

  return {
    // State
    state,

    // Computed
    currentKey,
    description,
    translations,
    hasUnsavedChanges,
    isPlural,
    pluralVariable,
    selectConfigs,

    // Methods
    loadTranslation,
    saveTranslation,
    updateTranslation,
    updateMetadata,
    updatePluralVariable,
    validate,
    resetState,
    togglePluralMode,
    toggleSelectMode,
    updateSelectConfig,
    getSelectConfig,
    isFieldDirty,
  };
}
