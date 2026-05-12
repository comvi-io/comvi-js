import { describe, it, expect } from "vitest";
import {
  parseICUPlural,
  generateICUPlural,
  parseICUSelect,
  generateICUSelect,
  generateICUCombined,
  parseICUCombined,
  detectICUType,
} from "../src/utils/icuParser";

describe("icuParser", () => {
  describe("parseICUPlural (existing)", () => {
    it("should parse simple plural ICU string", () => {
      const icu = "{count, plural, one {1 item} other {# items}}";
      const result = parseICUPlural(icu);

      expect(result.variable).toBe("count");
      expect(result.forms).toEqual({
        one: "1 item",
        other: "# items",
      });
    });

    it("should handle all plural forms", () => {
      const icu =
        "{n, plural, zero {none} one {single} two {pair} few {several} many {lots} other {items}}";
      const result = parseICUPlural(icu);

      expect(result.variable).toBe("n");
      expect(result.forms).toEqual({
        zero: "none",
        one: "single",
        two: "pair",
        few: "several",
        many: "lots",
        other: "items",
      });
    });
  });

  describe("generateICUPlural (existing)", () => {
    it("should generate ICU plural string", () => {
      const forms = { one: "1 item", other: "# items" };
      const result = generateICUPlural(forms, "count");

      expect(result).toBe("{count, plural, one {1 item} other {# items}}");
    });

    it("should order forms correctly", () => {
      const forms = { other: "items", one: "item", few: "few items" };
      const result = generateICUPlural(forms, "n");

      expect(result).toBe("{n, plural, one {item} few {few items} other {items}}");
    });
  });

  describe("parseICUSelect", () => {
    it("should parse simple select ICU string", () => {
      const icu = "{gender, select, male {He} female {She} other {They}}";
      const result = parseICUSelect(icu);

      expect(result.variable).toBe("gender");
      expect(result.forms).toEqual({
        male: "He",
        female: "She",
        other: "They",
      });
    });

    it("should parse formality select", () => {
      const icu = "{formality, select, formal {Sie haben} informal {Du hast}}";
      const result = parseICUSelect(icu);

      expect(result.variable).toBe("formality");
      expect(result.forms).toEqual({
        formal: "Sie haben",
        informal: "Du hast",
      });
    });

    it("should handle select with placeholders inside", () => {
      const icu =
        "{f, select, formal {Sie haben {count} Nachrichten} informal {Du hast {count} Nachrichten}}";
      const result = parseICUSelect(icu);

      expect(result.variable).toBe("f");
      expect(result.forms.formal).toBe("Sie haben {count} Nachrichten");
      expect(result.forms.informal).toBe("Du hast {count} Nachrichten");
    });

    it("should handle select with special characters", () => {
      const icu = "{type, select, admin {Welcome, admin!} user {Hello, user.}}";
      const result = parseICUSelect(icu);

      expect(result.forms.admin).toBe("Welcome, admin!");
      expect(result.forms.user).toBe("Hello, user.");
    });

    it("should return fallback for non-select strings", () => {
      const icu = "Hello world";
      const result = parseICUSelect(icu);

      expect(result.variable).toBe("select");
      expect(result.forms).toEqual({ other: "Hello world" });
    });

    it("should handle empty select forms", () => {
      const icu = "{status, select, active {} inactive {Not active}}";
      const result = parseICUSelect(icu);

      expect(result.forms.active).toBe("");
      expect(result.forms.inactive).toBe("Not active");
    });
  });

  describe("generateICUSelect", () => {
    it("should generate ICU select string", () => {
      const forms = { male: "He", female: "She", other: "They" };
      const result = generateICUSelect(forms, "gender");

      expect(result).toContain("{gender, select,");
      expect(result).toContain("male {He}");
      expect(result).toContain("female {She}");
      expect(result).toContain("other {They}");
    });

    it("should generate formality select", () => {
      const forms = { formal: "Sie", informal: "Du" };
      const result = generateICUSelect(forms, "formality");

      expect(result).toBe("{formality, select, formal {Sie} informal {Du}}");
    });

    it("should handle single option", () => {
      const forms = { other: "Default text" };
      const result = generateICUSelect(forms, "type");

      expect(result).toBe("{type, select, other {Default text}}");
    });

    it("should preserve order of forms", () => {
      const forms = { formal: "A", informal: "B", other: "C" };
      const result = generateICUSelect(forms, "f");

      // Other should come last
      expect(result.endsWith("other {C}}")).toBe(true);
    });

    it("roundtrip: parse -> generate -> parse should be consistent", () => {
      const original = "{gender, select, male {He went} female {She went} other {They went}}";
      const parsed = parseICUSelect(original);
      const generated = generateICUSelect(parsed.forms, parsed.variable);
      const reparsed = parseICUSelect(generated);

      expect(reparsed.variable).toBe(parsed.variable);
      expect(reparsed.forms).toEqual(parsed.forms);
    });
  });

  describe("detectICUType", () => {
    it("should detect singular strings", () => {
      expect(detectICUType("Hello world")).toBe("singular");
      expect(detectICUType("Welcome, {name}!")).toBe("singular");
      expect(detectICUType("")).toBe("singular");
    });

    it("should detect plural strings", () => {
      expect(detectICUType("{count, plural, one {item} other {items}}")).toBe("plural");
      expect(detectICUType("{n, plural, zero {none} one {one} other {many}}")).toBe("plural");
    });

    it("should detect select strings", () => {
      expect(detectICUType("{gender, select, male {He} female {She}}")).toBe("select");
      expect(detectICUType("{f, select, formal {Sie} informal {Du}}")).toBe("select");
    });

    it("should detect combined (plural + select) strings", () => {
      const combined =
        "{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}}}";
      expect(detectICUType(combined)).toBe("combined");
    });

    it("should detect combined (select inside plural)", () => {
      const combined =
        "{count, plural, one {{gender, select, male {He} female {She}}} other {items}}";
      expect(detectICUType(combined)).toBe("combined");
    });

    it("should handle edge cases", () => {
      // Text containing "plural" but not ICU format
      expect(detectICUType("The plural form is used here")).toBe("singular");
      // Text containing "select" but not ICU format
      expect(detectICUType("Please select an option")).toBe("singular");
    });
  });

  describe("generateICUCombined", () => {
    it("should generate combined ICU from composite keys", () => {
      const forms = {
        "formal:one": "Sie haben # Nachricht",
        "formal:other": "Sie haben # Nachrichten",
        "informal:one": "Du hast # Nachricht",
        "informal:other": "Du hast # Nachrichten",
      };
      const result = generateICUCombined(
        forms,
        "formality",
        "count",
        ["formal", "informal"],
        ["one", "other"],
      );

      expect(result).toContain("{formality, select,");
      expect(result).toContain("formal {{count, plural,");
      expect(result).toContain("informal {{count, plural,");
      expect(result).toContain("one {Sie haben # Nachricht}");
      expect(result).toContain("other {Sie haben # Nachrichten}");
    });

    it("should handle missing forms gracefully", () => {
      const forms = {
        "formal:one": "Text",
        // Missing formal:other, informal:one, informal:other
      };
      const result = generateICUCombined(forms, "f", "n", ["formal", "informal"], ["one", "other"]);

      expect(result).toContain("{f, select,");
      expect(result).toContain("formal {{n, plural,");
      expect(result).toContain("one {Text}");
      expect(result).toContain("other {}"); // Empty for missing
    });
  });

  describe("parseICUCombined", () => {
    it("should parse combined ICU to composite keys", () => {
      const icu =
        "{formality, select, formal {{count, plural, one {Sie haben # Nachricht} other {Sie haben # Nachrichten}}} informal {{count, plural, one {Du hast # Nachricht} other {Du hast # Nachrichten}}}}";
      const result = parseICUCombined(icu);

      expect(result.selectVariable).toBe("formality");
      expect(result.pluralVariable).toBe("count");
      expect(result.forms["formal:one"]).toBe("Sie haben # Nachricht");
      expect(result.forms["formal:other"]).toBe("Sie haben # Nachrichten");
      expect(result.forms["informal:one"]).toBe("Du hast # Nachricht");
      expect(result.forms["informal:other"]).toBe("Du hast # Nachrichten");
    });

    it("roundtrip: generate -> parse should be consistent", () => {
      const original = {
        "formal:one": "A",
        "formal:other": "B",
        "informal:one": "C",
        "informal:other": "D",
      };
      const generated = generateICUCombined(
        original,
        "f",
        "n",
        ["formal", "informal"],
        ["one", "other"],
      );
      const parsed = parseICUCombined(generated);

      expect(parsed.selectVariable).toBe("f");
      expect(parsed.pluralVariable).toBe("n");
      expect(parsed.forms["formal:one"]).toBe("A");
      expect(parsed.forms["formal:other"]).toBe("B");
      expect(parsed.forms["informal:one"]).toBe("C");
      expect(parsed.forms["informal:other"]).toBe("D");
    });
  });
});
