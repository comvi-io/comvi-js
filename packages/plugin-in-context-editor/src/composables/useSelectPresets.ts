export interface SelectOption {
  /** The key used in ICU format (e.g., "male", "formal") */
  key: string;
  /** Human-readable label for the UI */
  label: string;
}

export interface SelectPreset {
  id: string;
  name: string;
  variable: string;
  options: SelectOption[];
  /** Whether this preset requires an 'other' fallback */
  requiresOther: boolean;
}

export const SELECT_PRESETS: SelectPreset[] = [
  {
    id: "gender",
    name: "Gender",
    variable: "gender",
    options: [
      { key: "male", label: "Male" },
      { key: "female", label: "Female" },
      { key: "other", label: "Other / Neutral" },
    ],
    requiresOther: true,
  },
  {
    id: "formality",
    name: "Formality",
    variable: "formality",
    options: [
      { key: "formal", label: "Formal" },
      { key: "informal", label: "Informal" },
    ],
    requiresOther: false,
  },
  {
    id: "custom",
    name: "Custom",
    variable: "select",
    options: [],
    requiresOther: false,
  },
];

export function getPresetById(id: string): SelectPreset | undefined {
  return SELECT_PRESETS.find((preset) => preset.id === id);
}

/** The default is `formality`. */
export function getDefaultPreset(): SelectPreset {
  return SELECT_PRESETS.find((preset) => preset.id === "formality")!;
}

export function getPresetOptions(): Array<{ value: string; label: string }> {
  return SELECT_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.name,
  }));
}

export function createCustomPreset(variable: string, options: string[]): SelectPreset {
  return {
    id: "custom",
    name: "Custom",
    variable,
    options: options.map((key) => ({ key, label: key })),
    requiresOther: false,
  };
}

/** Falls back to a custom preset when no built-in one matches. */
export function detectPresetFromForms(variable: string, formKeys: string[]): SelectPreset {
  for (const preset of SELECT_PRESETS) {
    if (preset.id === "custom") continue;

    const presetKeys = preset.options.map((opt) => opt.key);

    const allKeysMatch = formKeys.every((key) => presetKeys.includes(key));

    const variableMatches =
      variable === preset.variable || variable.toLowerCase() === preset.variable.toLowerCase();

    if (allKeysMatch && variableMatches) {
      return preset;
    }
  }

  return createCustomPreset(variable, formKeys);
}

export function useSelectPresets() {
  return {
    presets: SELECT_PRESETS,
    getPresetById,
    getDefaultPreset,
    getPresetOptions,
    createCustomPreset,
    detectPresetFromForms,
  };
}
