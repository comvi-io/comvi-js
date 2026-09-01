import { describe, it, expect } from "vitest";
import {
  parseICUPlural,
  generateICUPlural,
  parseICUSelect,
  generateICUSelect,
  generateICUCombined,
  parseICUCombined,
  detectICUType,
  pluralToSingular,
} from "../src/utils/icuParser";

describe("icuParser", () => {
  describe("parseICUPlural", () => {
    it("should parse simple plural ICU string", () => {
      const icu = "{count, plural, one {1 item} other {# items}}";
      const result = parseICUPlural(icu);

      expect(result.variable).toBe("count");
      expect(result.forms).toEqual({
        one: "1 item",
        other: "# items",
      });
    });

    it("should return the singular fallback for a non-plural string", () => {
      const result = parseICUPlural("Hello world");

      expect(result).toEqual({ variable: "count", forms: { other: "Hello world" } });
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

    it("parses a plural string written without spaces around the ICU keywords", () => {
      const result = parseICUPlural("{count,plural,one {1 item} other {# items}}");

      expect(result).toEqual({ variable: "count", forms: { one: "1 item", other: "# items" } });
    });

    it("parses arms written without a space before the brace", () => {
      const result = parseICUPlural("{count, plural, one{1 item} other{# items}}");

      expect(result).toEqual({ variable: "count", forms: { one: "1 item", other: "# items" } });
    });

    it("ignores whitespace around the whole ICU string", () => {
      const result = parseICUPlural("  {count, plural, one {1 item} other {# items}}  ");

      expect(result).toEqual({ variable: "count", forms: { one: "1 item", other: "# items" } });
    });

    it("trims the whitespace around an arm's text", () => {
      const result = parseICUPlural("{count, plural, one {  1 item  } other {# items}}");

      expect(result.forms).toEqual({ one: "1 item", other: "# items" });
    });

    it("keeps a nested placeholder inside an arm's text", () => {
      const result = parseICUPlural("{count, plural, one {{name} has 1 item} other {# items}}");

      expect(result.forms).toEqual({ one: "{name} has 1 item", other: "# items" });
    });

    it("returns the singular fallback when the plural block is wrapped in surrounding text", () => {
      const icu = "You have {count, plural, one {# item} other {# items}} today";

      expect(parseICUPlural(icu)).toEqual({ variable: "count", forms: { other: icu } });
    });

    it("returns the singular fallback for a plural string split across lines", () => {
      const icu = "{count, plural,\n  one {1 item}\n  other {# items}\n}";

      expect(parseICUPlural(icu)).toEqual({ variable: "count", forms: { other: icu } });
    });
  });

  describe("generateICUPlural", () => {
    it("should generate ICU plural string", () => {
      const forms = { one: "1 item", other: "# items" };
      const result = generateICUPlural(forms, "count");

      expect(result).toBe("{count, plural, one {1 item} other {# items}}");
    });

    it("should generate an empty arm list for empty forms", () => {
      expect(generateICUPlural({}, "n")).toBe("{n, plural, }");
    });

    it("should order forms correctly", () => {
      const forms = { other: "items", one: "item", few: "few items" };
      const result = generateICUPlural(forms, "n");

      expect(result).toBe("{n, plural, one {item} few {few items} other {items}}");
    });

    it("defaults the variable to count when none is given", () => {
      expect(generateICUPlural({ other: "x" })).toBe("{count, plural, other {x}}");
    });

    it("orders the zero, two and many arms in CLDR order", () => {
      const forms = { many: "lots", zero: "none", other: "items", two: "pair" };

      expect(generateICUPlural(forms, "n")).toBe(
        "{n, plural, zero {none} two {pair} many {lots} other {items}}",
      );
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

    it("should keep commas and the # placeholder inside form values", () => {
      const icu = "{type, select, admin {Welcome, admin: # left} user {Hello, user.}}";

      const result = parseICUSelect(icu);

      expect(result.forms).toEqual({
        admin: "Welcome, admin: # left",
        user: "Hello, user.",
      });
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

    it("parses a select string written without spaces around the ICU keywords", () => {
      const result = parseICUSelect("{gender,select,male{He} female{She}}");

      expect(result).toEqual({ variable: "gender", forms: { male: "He", female: "She" } });
    });

    it("ignores whitespace around the whole ICU string", () => {
      const result = parseICUSelect("  {gender, select, male {He} female {She}}  ");

      expect(result).toEqual({ variable: "gender", forms: { male: "He", female: "She" } });
    });

    it("returns the singular fallback when the select block is wrapped in surrounding text", () => {
      const icu = "Hello {gender, select, male {He} female {She}}";

      expect(parseICUSelect(icu)).toEqual({ variable: "select", forms: { other: icu } });
    });

    it("stops at the first arm name it cannot recognize", () => {
      const result = parseICUSelect("{gender, select, male {He} oops female {She}}");

      expect(result).toEqual({ variable: "gender", forms: { male: "He" } });
    });

    it("drops the last character of an arm whose closing brace is missing", () => {
      // Pins the current lossy fallback for unbalanced braces.
      const result = parseICUSelect("{gender, select, male {He}");

      expect(result).toEqual({ variable: "gender", forms: { male: "H" } });
    });
  });

  describe("pluralToSingular", () => {
    it("prefers the other form over the forms declared before it", () => {
      expect(pluralToSingular({ one: "One item", other: "Some items" })).toBe("Some items");
    });

    it("falls back to the first form present when there is no other or one form", () => {
      expect(pluralToSingular({ few: "A few items" })).toBe("A few items");
    });

    it("returns an empty string for an empty form map", () => {
      expect(pluralToSingular({})).toBe("");
    });
  });

  describe("generateICUSelect", () => {
    it("should generate ICU select string", () => {
      const forms = { male: "He", female: "She", other: "They" };

      const result = generateICUSelect(forms, "gender");

      expect(result).toBe("{gender, select, male {He} female {She} other {They}}");
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

    it("should put the other arm last, whatever the key order", () => {
      const forms = { other: "C", formal: "A", informal: "B" };

      const result = generateICUSelect(forms, "f");

      expect(result).toBe("{f, select, formal {A} informal {B} other {C}}");
    });

    it("roundtrip: parse -> generate -> parse should be consistent", () => {
      const original = "{gender, select, male {He went} female {She went} other {They went}}";

      const parsed = parseICUSelect(original);
      const generated = generateICUSelect(parsed.forms, parsed.variable);

      expect(parsed).toEqual({
        variable: "gender",
        forms: { male: "He went", female: "She went", other: "They went" },
      });
      expect(generated).toBe(original);
      expect(parseICUSelect(generated)).toEqual(parsed);
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

    it("should treat prose containing the words plural or select as singular", () => {
      expect(detectICUType("The plural form is used here")).toBe("singular");
      expect(detectICUType("Please select an option")).toBe("singular");
    });

    it.each([
      ["{ count, plural, one {a} other {b}}", "space after the opening brace"],
      ["{count , plural, one {a} other {b}}", "space before the first comma"],
      ["{count,plural,one {a} other {b}}", "no spaces at all"],
      ["{count, plural , one {a} other {b}}", "space before the second comma"],
    ])("detects %j as plural (%s)", (icu) => {
      expect(detectICUType(icu)).toBe("plural");
    });

    it.each([
      ["{ gender, select, male {a} other {b}}", "space after the opening brace"],
      ["{gender , select, male {a} other {b}}", "space before the first comma"],
      ["{gender,select,male {a} other {b}}", "no spaces at all"],
      ["{gender, select , male {a} other {b}}", "space before the second comma"],
    ])("detects %j as select (%s)", (icu) => {
      expect(detectICUType(icu)).toBe("select");
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

      expect(result).toBe(
        "{formality, select, " +
          "formal {{count, plural, one {Sie haben # Nachricht} other {Sie haben # Nachrichten}}} " +
          "informal {{count, plural, one {Du hast # Nachricht} other {Du hast # Nachrichten}}}}",
      );
    });

    it("should handle missing forms gracefully", () => {
      const forms = { "formal:one": "Text" };

      const result = generateICUCombined(forms, "f", "n", ["formal", "informal"], ["one", "other"]);

      expect(result).toBe(
        "{f, select, formal {{n, plural, one {Text} other {}}} informal {{n, plural, one {} other {}}}}",
      );
    });
  });

  describe("parseICUCombined", () => {
    it("should parse combined ICU to composite keys", () => {
      const icu =
        "{formality, select, formal {{count, plural, one {Sie haben # Nachricht} other {Sie haben # Nachrichten}}} informal {{count, plural, one {Du hast # Nachricht} other {Du hast # Nachrichten}}}}";
      const result = parseICUCombined(icu);

      expect(result).toEqual({
        selectVariable: "formality",
        pluralVariable: "count",
        forms: {
          "formal:one": "Sie haben # Nachricht",
          "formal:other": "Sie haben # Nachrichten",
          "informal:one": "Du hast # Nachricht",
          "informal:other": "Du hast # Nachrichten",
        },
      });
    });

    it("should key a select arm that holds no inner plural as <arm>:other", () => {
      const icu =
        "{formality, select, formal {Guten Tag} informal {{count, plural, one {Hi} other {Hi all}}}}";

      const result = parseICUCombined(icu);

      expect(result).toEqual({
        selectVariable: "formality",
        pluralVariable: "count",
        forms: {
          "formal:other": "Guten Tag",
          "informal:one": "Hi",
          "informal:other": "Hi all",
        },
      });
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

      expect(generated).toBe(
        "{f, select, formal {{n, plural, one {A} other {B}}} informal {{n, plural, one {C} other {D}}}}",
      );
      expect(parsed).toEqual({ selectVariable: "f", pluralVariable: "n", forms: original });
    });

    it("keeps the plural variable of the plural arm when a later arm has none", () => {
      const icu =
        "{formality, select, informal {{n, plural, one {Hi} other {Hi all}}} formal {Guten Tag}}";

      const result = parseICUCombined(icu);

      expect(result).toEqual({
        selectVariable: "formality",
        pluralVariable: "n",
        forms: {
          "informal:one": "Hi",
          "informal:other": "Hi all",
          "formal:other": "Guten Tag",
        },
      });
    });
  });
});
