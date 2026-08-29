import { describe, it, expect } from "vitest";
import {
  SELECT_PRESETS,
  getPresetById,
  getDefaultPreset,
  getPresetOptions,
  createCustomPreset,
  detectPresetFromForms,
} from "../src/composables/useSelectPresets";

describe("useSelectPresets", () => {
  describe("SELECT_PRESETS", () => {
    it("should ship the gender, formality and custom presets in that order", () => {
      expect(SELECT_PRESETS).toEqual([
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
      ]);
    });
  });

  describe("getPresetById", () => {
    it("should return preset by id", () => {
      const gender = getPresetById("gender");
      expect(gender?.id).toBe("gender");
      expect(gender?.variable).toBe("gender");
    });

    it("should return undefined for unknown id", () => {
      const unknown = getPresetById("nonexistent");
      expect(unknown).toBeUndefined();
    });

    it("should return undefined for an empty id", () => {
      expect(getPresetById("")).toBeUndefined();
    });
  });

  describe("getDefaultPreset", () => {
    it("should return formality as default", () => {
      const preset = getDefaultPreset();
      expect(preset.id).toBe("formality");
    });
  });

  describe("getPresetOptions", () => {
    it("should map every preset id to value and name to label", () => {
      expect(getPresetOptions()).toEqual([
        { value: "gender", label: "Gender" },
        { value: "formality", label: "Formality" },
        { value: "custom", label: "Custom" },
      ]);
    });
  });

  describe("createCustomPreset", () => {
    it("should create custom preset with given options", () => {
      expect(createCustomPreset("status", ["active", "inactive"])).toEqual({
        id: "custom",
        name: "Custom",
        variable: "status",
        options: [
          { key: "active", label: "active" },
          { key: "inactive", label: "inactive" },
        ],
        requiresOther: false,
      });
    });

    it("should create preset with empty options", () => {
      const preset = createCustomPreset("empty", []);
      expect(preset.options).toEqual([]);
    });
  });

  describe("detectPresetFromForms", () => {
    it("should detect gender preset", () => {
      const preset = detectPresetFromForms("gender", ["male", "female", "other"]);
      expect(preset.id).toBe("gender");
    });

    it("should detect formality preset", () => {
      const preset = detectPresetFromForms("formality", ["formal", "informal"]);
      expect(preset.id).toBe("formality");
    });

    it("should detect formality with partial keys", () => {
      const preset = detectPresetFromForms("formality", ["formal"]);
      expect(preset.id).toBe("formality");
    });

    it("should return custom for unknown forms", () => {
      const preset = detectPresetFromForms("status", ["active", "inactive"]);
      expect(preset.id).toBe("custom");
      expect(preset.variable).toBe("status");
      expect(preset.options.map((o) => o.key)).toEqual(["active", "inactive"]);
    });

    it("should be case insensitive for variable matching", () => {
      const preset = detectPresetFromForms("Gender", ["male", "female"]);
      expect(preset.id).toBe("gender");
    });

    it("should return custom when keys dont match preset", () => {
      const preset = detectPresetFromForms("gender", ["man", "woman"]);
      expect(preset.id).toBe("custom");
    });

    it("should match the first preset whose variable matches when no form keys are given", () => {
      // Every key of an empty list trivially matches, so the variable decides.
      expect(detectPresetFromForms("gender", [])).toBe(SELECT_PRESETS[0]);
    });
  });
});
