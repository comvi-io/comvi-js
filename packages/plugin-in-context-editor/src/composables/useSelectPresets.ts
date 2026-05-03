/**
 * Composable for ICU select format presets
 * Provides common select patterns like gender and formality
 */

/**
 * A select option within a preset
 */
export interface SelectOption {
  /** The key used in ICU format (e.g., "male", "formal") */
  key: string;
  /** Human-readable label for the UI */
  label: string;
}

/**
 * A select preset configuration
 */
export interface SelectPreset {
  /** Unique identifier for the preset */
  id: string;
  /** Human-readable name for the UI */
  name: string;
  /** Default variable name for ICU format */
  variable: string;
  /** Available options for this preset */
  options: SelectOption[];
  /** Whether this preset requires an 'other' fallback */
  requiresOther: boolean;
}

/**
 * Built-in select presets
 */
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

/**
 * Get a preset by its ID
 * @param id - Preset identifier
 * @returns The preset or undefined if not found
 */
export function getPresetById(id: string): SelectPreset | undefined {
  return SELECT_PRESETS.find((preset) => preset.id === id);
}

/**
 * Get the default preset (formality)
 */
export function getDefaultPreset(): SelectPreset {
  return SELECT_PRESETS.find((preset) => preset.id === "formality")!;
}

/**
 * Get list of preset options for dropdown
 * @returns Array of { value, label } for use in select dropdowns
 */
export function getPresetOptions(): Array<{ value: string; label: string }> {
  return SELECT_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.name,
  }));
}

/**
 * Create a custom preset with user-defined options
 * @param variable - Variable name for ICU format
 * @param options - Array of option keys
 * @returns A custom SelectPreset
 */
export function createCustomPreset(variable: string, options: string[]): SelectPreset {
  return {
    id: "custom",
    name: "Custom",
    variable,
    options: options.map((key) => ({ key, label: key })),
    requiresOther: false,
  };
}

/**
 * Detect preset from existing ICU select forms
 * @param variable - Variable name from parsed ICU
 * @param formKeys - Keys from parsed ICU forms
 * @returns Matching preset or custom preset
 */
export function detectPresetFromForms(variable: string, formKeys: string[]): SelectPreset {
  // Try to match built-in presets
  for (const preset of SELECT_PRESETS) {
    if (preset.id === "custom") continue;

    const presetKeys = preset.options.map((opt) => opt.key);

    // Check if all form keys are in preset options
    const allKeysMatch = formKeys.every((key) => presetKeys.includes(key));

    // Check if variable matches (or is close enough)
    const variableMatches =
      variable === preset.variable || variable.toLowerCase() === preset.variable.toLowerCase();

    if (allKeysMatch && variableMatches) {
      return preset;
    }
  }

  // Return custom preset if no match
  return createCustomPreset(variable, formKeys);
}

/**
 * Main composable hook for select presets
 * Returns all utilities for working with select presets
 */
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
