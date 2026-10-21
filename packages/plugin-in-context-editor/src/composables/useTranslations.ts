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
 * @param languages - Reactive ref of language configurations, used for validation
 * @param instanceId - Optional i18n instance ID to scope runtime cache updates
 */
export function useTranslations(
  languages: Ref<Language[]>,
  instanceId?: MaybeRef<string | undefined>,
) {
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
  // One editing session per load/reset. A save remembers the session it
  // started in; when it settles later, it must not touch a newer session.
  const session = ref(0);
  const savingSession = ref<number | null>(null);
  const isSaving = computed(() => savingSession.value === session.value);
  // The plural shape and select configs at last load/save, serialized. A
  // language whose forms and shape still match was not edited and is not sent.
  let baselineShape = "";
  let baselineSelectConfigs: Record<string, string> = {};

  function shapeOf(data: TranslationData): string {
    return JSON.stringify([data.isPlural, data.pluralVariable ?? ""]);
  }

  function setBaseline(data: TranslationData): void {
    baselineTranslations.value = snapshotTranslations(data.translations);
    baselineShape = shapeOf(data);
    baselineSelectConfigs = Object.fromEntries(
      Object.entries(data.selectConfigs ?? {}).map(([lang, config]) => [
        lang,
        JSON.stringify(config),
      ]),
    );
  }

  function isLanguageUnedited(data: TranslationData, langCode: string): boolean {
    const baselineForms = baselineTranslations.value?.[langCode];
    return (
      baselineForms !== undefined &&
      shapeOf(data) === baselineShape &&
      JSON.stringify(data.translations[langCode]) === JSON.stringify(baselineForms) &&
      JSON.stringify(data.selectConfigs?.[langCode]) === baselineSelectConfigs[langCode]
    );
  }

  /**
   * Only edited languages are sent: a write sets the status, so sending an
   * untouched language would reset its review status on the server.
   */
  function editedTranslations(data: TranslationData): Record<string, Record<string, string>> {
    const edited: Record<string, Record<string, string>> = {};
    for (const [langCode, forms] of Object.entries(data.translations)) {
      const unedited =
        data.sourceValues?.[langCode] !== undefined && isLanguageUnedited(data, langCode);
      if (!unedited) {
        edited[langCode] = { ...forms };
      }
    }
    return edited;
  }

  /** ICU the fields cannot rebuild is sent as written. */
  function verbatimValues(
    data: TranslationData,
    translations: Record<string, Record<string, string>>,
  ): Record<string, string> {
    const verbatim: Record<string, string> = {};
    for (const [langCode, forms] of Object.entries(translations)) {
      if (data.rawLanguages?.includes(langCode)) {
        verbatim[langCode] = forms.other ?? "";
      }
    }
    return verbatim;
  }

  function isRawLanguage(langCode: string): boolean {
    return state.value.data?.rawLanguages?.includes(langCode) ?? false;
  }

  function snapshotTranslations(
    translations: Record<string, Record<string, string>>,
  ): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [lang, forms] of Object.entries(translations)) {
      out[lang] = { ...forms };
    }
    return out;
  }

  const currentNamespace = ref<string>("");

  const currentKey = computed(() => state.value.data?.key);
  const description = computed(() => state.value.data?.description ?? "");
  const translations = computed(() => state.value.data?.translations || {});
  const hasUnsavedChanges = computed(() => state.value.isDirty);
  const isPlural = computed(() => state.value.data?.isPlural ?? false);
  const pluralVariable = computed(() => state.value.data?.pluralVariable ?? "");
  const selectConfigs = computed(() => state.value.data?.selectConfigs || {});

  async function loadTranslation(key: string, ns: string): Promise<void> {
    const requestId = ++latestLoadRequestId;
    session.value++;
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
      setBaseline(data);
    } catch (error) {
      if (requestId !== latestLoadRequestId) {
        return;
      }
      state.value.error = error instanceof Error ? error.message : "Failed to load translation";
      console.error("[@comvi/plugin-in-context-editor] Error loading translation:", error);
    } finally {
      if (requestId === latestLoadRequestId) {
        state.value.isLoading = false;
      }
    }
  }

  /** Without this the edit would not show until the page reloads. */
  function updateRuntimeCache(
    data: TranslationData,
    namespace: string,
    scopeId: string | undefined,
    scopeLanguages: Language[],
  ): void {
    const i18n = getI18nInstance(scopeId);
    if (!i18n) {
      console.warn(
        "[@comvi/plugin-in-context-editor] Cannot update runtime cache: i18n instance not available",
      );
      return;
    }

    // Use "lang:namespace" format as key, which addMessages expects
    const translationsToAdd: Record<string, Record<string, string>> = {};

    Object.entries(data.translations).forEach(([langCode, forms]) => {
      const cacheKey = `${langCode}:${namespace}`;
      if (!translationsToAdd[cacheKey]) {
        translationsToAdd[cacheKey] = {};
      }

      const selectConfig = data.selectConfigs?.[langCode];
      const storedValue = data.sourceValues?.[langCode];

      if (storedValue !== undefined) {
        // What the server stored is what the app would load next time.
        translationsToAdd[cacheKey][String(data.key)] = storedValue;
      } else if (data.isPlural && selectConfig?.enabled) {
        // Select wrapping plural: composite keys like "formal:one".
        const lang = scopeLanguages.find((l) => l.code === langCode);
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
        const icuFormat = generateICUPlural(forms, data.pluralVariable || DEFAULT_PLURAL_VARIABLE);
        translationsToAdd[cacheKey][String(data.key)] = icuFormat;
      } else if (selectConfig?.enabled) {
        const icuFormat = generateICUSelect(
          forms,
          selectConfig.variable || DEFAULT_SELECT_VARIABLE,
        );
        translationsToAdd[cacheKey][String(data.key)] = icuFormat;
      } else {
        translationsToAdd[cacheKey][String(data.key)] = forms.other || "";
      }
    });

    i18n.addMessages(translationsToAdd);
  }

  async function saveTranslation(): Promise<TranslationData | null> {
    if (!state.value.data) {
      state.value.error = "No translation data to save";
      return null;
    }

    if (!currentNamespace.value || currentNamespace.value.trim() === "") {
      state.value.error = "No namespace set. Please ensure the translation has a valid namespace.";
      console.error(
        "[@comvi/plugin-in-context-editor] Save failed: namespace is",
        currentNamespace.value,
      );
      return null;
    }

    const validationResult = validate();
    if (!validationResult.isValid) {
      state.value.error = `Validation failed: ${validationResult.errors
        .map((e) => e.message)
        .join(", ")}`;
      return null;
    }

    if (isSaving.value) {
      return null;
    }

    // Everything the save needs is captured now: the modal can move on to
    // another key, namespace or instance before the request settles.
    const saveSession = session.value;
    const data = state.value.data;
    const namespace = currentNamespace.value;
    const scopeId = unref(instanceId);
    const scopeLanguages = languages.value;
    const translationsToSave = editedTranslations(data);
    const verbatim = verbatimValues(data, translationsToSave);
    const selectConfigs = data.selectConfigs
      ? Object.fromEntries(
          Object.entries(data.selectConfigs).map(([lang, config]) => [
            lang,
            { ...config, options: [...config.options] },
          ]),
        )
      : undefined;

    savingSession.value = saveSession;
    state.value.isLoading = true;
    state.value.error = null;

    try {
      const savedData = await saveTranslationService(
        String(data.key),
        namespace,
        translationsToSave,
        data.isPlural,
        data.pluralVariable,
        selectConfigs,
        scopeId,
        verbatim,
        data.sourceValues,
      );

      // The server holds the new value either way, so the runtime the save
      // was made for shows it too.
      updateRuntimeCache(savedData, namespace, scopeId, scopeLanguages);

      if (saveSession !== session.value) {
        return null;
      }
      state.value.data = savedData;
      state.value.isDirty = false;
      setBaseline(savedData);

      return savedData;
    } catch (error) {
      console.error("[@comvi/plugin-in-context-editor] Error saving translation:", error);
      if (saveSession !== session.value) {
        return null;
      }
      state.value.error = error instanceof Error ? error.message : "Failed to save translation";
      return null;
    } finally {
      if (saveSession === session.value) {
        state.value.isLoading = false;
      }
      if (savingSession.value === saveSession) {
        savingSession.value = null;
      }
    }
  }

  function updateTranslation(languageCode: string, pluralForm: string, value: string): void {
    if (!state.value.data) {
      console.warn("[@comvi/plugin-in-context-editor] Cannot update translation: no data loaded");
      return;
    }

    if (!state.value.data.translations[languageCode]) {
      state.value.data.translations[languageCode] = {};
    }

    state.value.data.translations[languageCode][pluralForm] = value;

    state.value.isDirty = true;
  }

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

    const translationValidation = validateTranslations(
      languages.value,
      state.value.data.translations,
    );

    // The plural variable matters only if some language is rebuilt from its
    // forms; a key whose languages are all sent as written needs none.
    const toSave = editedTranslations(state.value.data);
    const verbatim = verbatimValues(state.value.data, toSave);
    const rebuildsAny = Object.keys(toSave).some((langCode) => !(langCode in verbatim));
    if (state.value.data.isPlural && rebuildsAny) {
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

  function resetState(): void {
    session.value++;
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

  function updateMetadata(metadata: Partial<TranslationData["metadata"]>): void {
    if (!state.value.data) {
      console.warn("[@comvi/plugin-in-context-editor] Cannot update metadata: no data loaded");
      return;
    }

    state.value.data.metadata = {
      ...state.value.data.metadata,
      ...metadata,
    };

    state.value.isDirty = true;
  }

  /** @param variable - ICU plural variable name, e.g. "count" or "n" */
  function updatePluralVariable(variable: string): void {
    if (!state.value.data) {
      console.warn(
        "[@comvi/plugin-in-context-editor] Cannot update plural variable: no data loaded",
      );
      return;
    }

    // Stored as-is; validation is what rejects empty values.
    state.value.data.pluralVariable = variable;
    state.value.isDirty = true;
  }

  function pluralFormsOf(langCode: string): string[] {
    return languages.value.find((l) => l.code === langCode)?.pluralForms ?? ["one", "other"];
  }

  /** Composite `<option>:<pluralForm>` forms; `valueOf` picks each value. */
  function combinedForms(
    options: string[],
    pluralForms: string[],
    valueOf: (option: string, pluralForm: string) => string | undefined,
  ): Record<string, string> {
    const forms: Record<string, string> = {};
    for (const option of options) {
      for (const pluralForm of pluralForms) {
        forms[`${option}:${pluralForm}`] = valueOf(option, pluralForm) ?? "";
      }
    }
    return forms;
  }

  /** Existing translations are converted between the two shapes. */
  function togglePluralMode(enabled: boolean): void {
    if (!state.value.data) {
      console.warn("[@comvi/plugin-in-context-editor] Cannot toggle plural mode: no data loaded");
      return;
    }

    state.value.data.isPlural = enabled;

    if (enabled && !state.value.data.pluralVariable) {
      state.value.data.pluralVariable = DEFAULT_PLURAL_VARIABLE;
    }

    Object.keys(state.value.data.translations).forEach((langCode) => {
      const lang = languages.value.find((l) => l.code === langCode);
      if (!lang || isRawLanguage(langCode)) return;

      const forms = state.value.data!.translations[langCode] || {};
      const selectConfig = state.value.data!.selectConfigs?.[langCode];
      if (selectConfig?.enabled) {
        // Variants stay; plural forms are added to or removed from each one.
        state.value.data!.translations[langCode] = enabled
          ? combinedForms(selectConfig.options, lang.pluralForms, (option) => forms[option])
          : Object.fromEntries(
              selectConfig.options.map((option) => [option, forms[`${option}:other`] ?? ""]),
            );
        return;
      }

      if (enabled) {
        const singular = state.value.data!.translations[langCode]?.other || "";
        state.value.data!.translations[langCode] = singularToPlural(singular, lang.pluralForms);
      } else {
        // Plural → singular keeps the `other` form.
        const plural = state.value.data!.translations[langCode];
        state.value.data!.translations[langCode] = {
          other: pluralToSingular(plural || {}),
        };
      }
    });

    state.value.isDirty = true;
  }

  /** @param config - Optional initial config (variable, options) */
  function toggleSelectMode(
    langCode: string,
    enabled: boolean,
    config?: { variable: string; options: string[] },
  ): void {
    if (!state.value.data) {
      console.warn("[@comvi/plugin-in-context-editor] Cannot toggle select mode: no data loaded");
      return;
    }
    if (isRawLanguage(langCode)) return;

    if (!state.value.data.selectConfigs) {
      state.value.data.selectConfigs = {};
    }

    if (enabled) {
      const variable = config?.variable || DEFAULT_SELECT_VARIABLE;
      const options = config?.options || ["formal", "informal"];

      state.value.data.selectConfigs[langCode] = {
        enabled: true,
        variable,
        options,
      };

      const current = state.value.data.translations[langCode] || {};
      if (state.value.data.isPlural) {
        // Every variant starts with the plural forms the message already has.
        state.value.data.translations[langCode] = combinedForms(
          options,
          pluralFormsOf(langCode),
          (_option, pluralForm) => current[pluralForm] ?? current.other,
        );
      } else {
        const currentValue = current.other || "";
        const selectForms: Record<string, string> = {};
        options.forEach((opt) => {
          selectForms[opt] = currentValue;
        });
        state.value.data.translations[langCode] = selectForms;
      }
    } else {
      const previous = state.value.data.selectConfigs[langCode];
      if (previous) {
        previous.enabled = false;
      }

      const forms = state.value.data.translations[langCode] || {};
      if (state.value.data.isPlural) {
        // Back to plain plural: the first variant's plural forms win.
        const first = previous?.options[0];
        state.value.data.translations[langCode] = Object.fromEntries(
          pluralFormsOf(langCode).map((pluralForm) => [
            pluralForm,
            forms[`${first}:${pluralForm}`] ?? "",
          ]),
        );
      } else {
        // Back to singular: the FIRST form's value wins.
        const firstValue = Object.values(forms)[0] || "";
        state.value.data.translations[langCode] = { other: firstValue };
      }
    }

    state.value.isDirty = true;
  }

  function updateSelectConfig(langCode: string, config: Partial<LanguageSelectConfig>): void {
    if (!state.value.data) {
      console.warn("[@comvi/plugin-in-context-editor] Cannot update select config: no data loaded");
      return;
    }
    if (isRawLanguage(langCode)) return;

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
      if (state.value.data.isPlural && state.value.data.selectConfigs[langCode].enabled) {
        // A new variant copies the plural forms of `other`, or of the first variant.
        const source = existing.options.includes("other") ? "other" : existing.options[0];
        state.value.data.translations[langCode] = combinedForms(
          config.options,
          pluralFormsOf(langCode),
          (option, pluralForm) =>
            currentForms[`${option}:${pluralForm}`] ?? currentForms[`${source}:${pluralForm}`],
        );
        state.value.isDirty = true;
        return;
      }
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

  function getSelectConfig(langCode: string): LanguageSelectConfig | undefined {
    return state.value.data?.selectConfigs?.[langCode];
  }

  return {
    state,

    currentKey,
    description,
    translations,
    hasUnsavedChanges,
    isSaving,
    isPlural,
    pluralVariable,
    selectConfigs,

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
    isRawLanguage,
  };
}
