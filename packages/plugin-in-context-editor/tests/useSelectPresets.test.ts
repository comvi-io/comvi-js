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
    it("should have gender preset", () => {
      const gender = SELECT_PRESETS.find((p) => p.id === "gender");
      expect(gender?.id).toBe("gender");
      expect(gender?.variable).toBe("gender");
      expect(gender?.requiresOther).toBe(true);
      expect(gender?.options.map((o) => o.key)).toEqual(["male", "female", "other"]);
    });

    it("should have formality preset", () => {
      const formality = SELECT_PRESETS.find((p) => p.id === "formality");
      expect(formality?.id).toBe("formality");
      expect(formality?.variable).toBe("formality");
      expect(formality?.requiresOther).toBe(false);
      expect(formality?.options.map((o) => o.key)).toEqual(["formal", "informal"]);
    });

    it("should have custom preset", () => {
      const custom = SELECT_PRESETS.find((p) => p.id === "custom");
      expect(custom?.id).toBe("custom");
      expect(custom?.variable).toBe("select");
      expect(custom?.options).toEqual([]);
      expect(custom?.requiresOther).toBe(false);
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
  });

  describe("getDefaultPreset", () => {
    it("should return formality as default", () => {
      const preset = getDefaultPreset();
      expect(preset.id).toBe("formality");
    });
  });

  describe("getPresetOptions", () => {
    it("should return array of options for dropdown", () => {
      const options = getPresetOptions();
      expect(options.length).toBe(SELECT_PRESETS.length);
      expect(options[0]).toHaveProperty("value");
      expect(options[0]).toHaveProperty("label");
    });

    it("should map preset id to value and name to label", () => {
      const options = getPresetOptions();
      const genderOption = options.find((o) => o.value === "gender");
      expect(genderOption).toEqual({ value: "gender", label: "Gender" });
    });
  });

  describe("createCustomPreset", () => {
    it("should create custom preset with given options", () => {
      const preset = createCustomPreset("status", ["active", "inactive"]);
      expect(preset.id).toBe("custom");
      expect(preset.variable).toBe("status");
      expect(preset.options).toHaveLength(2);
      expect(preset.options[0].key).toBe("active");
      expect(preset.options[0].label).toBe("active");
    });

    it("should create preset with empty options", () => {
      const preset = createCustomPreset("empty", []);
      expect(preset.options).toHaveLength(0);
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
  });
});
