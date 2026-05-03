import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractSchema } from "../src/extract";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("extractSchema", () => {
  describe("file-per-namespace structure", () => {
    it("should extract keys with namespace prefix", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

      expect(schema.keys["common:greeting"]).toBeDefined();
      expect(schema.keys["common:logout"]).toBeDefined();
      expect(schema.keys["admin:dashboard"]).toBeDefined();
    });

    it("should extract params from {name} syntax", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

      expect(schema.keys["common:greeting"].params).toEqual([{ name: "name", type: "string" }]);
    });

    it("should extract plural params as number", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

      expect(schema.keys["common:items"].params).toEqual([{ name: "count", type: "number" }]);
    });

    it("should flatten nested keys to dot notation", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

      expect(schema.keys["common:nav.home"]).toBeDefined();
      expect(schema.keys["common:nav.about"]).toBeDefined();
    });

    it("should merge params across languages", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

      // "info" has {name} in en, {name} and {count, plural} in fr
      const params = schema.keys["common:info"].params;
      expect(params).toContainEqual({ name: "name", type: "string" });
      expect(params).toContainEqual({ name: "count", type: "number" });
    });
  });

  describe("single-file-per-language structure", () => {
    it("should use 'default' namespace for flat files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "single-file"),
      });

      expect(schema.keys["default:greeting"]).toBeDefined();
      expect(schema.keys["default:nested.key"]).toBeDefined();
    });

    it("should use custom defaultNs for unmatched root-level files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "mixed-layout"),
        fileTemplate: "{namespace}/{languageTag}.json",
        defaultNs: "common",
      });

      expect(schema.keys["common:greeting"]).toBeDefined();
      expect(schema.keys["admin:dashboard"]).toBeDefined();
      expect(schema.keys["default:greeting"]).toBeUndefined();
    });
  });
});
