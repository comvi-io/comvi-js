import { afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractSchema, type ProjectSchema } from "../src/extract";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("extractSchema", () => {
  describe("file-per-namespace structure", () => {
    let schema: ProjectSchema;

    beforeAll(async () => {
      schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });
    });

    it("should extract keys with namespace prefix", () => {
      expect(Object.keys(schema.keys).sort()).toEqual([
        "admin:dashboard",
        "common:greeting",
        "common:info",
        "common:items",
        "common:logout",
        "common:nav.about",
        "common:nav.home",
      ]);
    });

    it("should extract params from {name} syntax", () => {
      expect(schema.keys["common:greeting"]).toEqual({
        params: [{ name: "name", type: "string" }],
      });
      expect(schema.keys["common:logout"]).toEqual({ params: [] });
    });

    it("should extract plural params as number", () => {
      expect(schema.keys["common:items"]).toEqual({
        params: [{ name: "count", type: "number" }],
      });
    });

    it("should flatten nested keys to dot notation", () => {
      expect(schema.keys["common:nav.home"]).toEqual({ params: [] });
      expect(schema.keys["common:nav.about"]).toEqual({ params: [] });
    });

    it("should merge params across languages", () => {
      // "info" carries {name} in en and adds {count, plural} in fr
      expect(schema.keys["common:info"]).toEqual({
        params: [
          { name: "name", type: "string" },
          { name: "count", type: "number" },
        ],
      });
    });
  });

  describe("single-file-per-language structure", () => {
    it("should use 'default' namespace for flat files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "single-file"),
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["default:greeting", "default:nested.key"]);
    });

    it("should use the v0.3 default layout for root default and namespace directories", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "mixed-layout"),
        defaultNs: "common",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["admin:dashboard", "common:greeting"]);
      expect(schema.keys["common:greeting"]).toEqual({
        params: [{ name: "name", type: "string" }],
      });
    });

    it("should use custom defaultNs for unmatched root-level files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "mixed-layout"),
        fileTemplate: "{namespace}/{languageTag}.json",
        defaultNs: "common",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["admin:dashboard", "common:greeting"]);
    });
  });

  describe("error and empty inputs", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
      await Promise.all(
        tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
      );
    });

    async function makeDir(): Promise<string> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-extract-"));
      tempDirs.push(dir);
      return dir;
    }

    it("returns an empty schema for a directory with no JSON files", async () => {
      const dir = await makeDir();

      await expect(extractSchema({ translationsPath: dir })).resolves.toEqual({ keys: {} });
    });

    it("rejects when a translation file contains invalid JSON", async () => {
      const dir = await makeDir();
      await fs.writeFile(path.join(dir, "en.json"), "{ invalid json", "utf-8");

      await expect(extractSchema({ translationsPath: dir })).rejects.toThrow(SyntaxError);
    });

    it("rejects when the translations directory does not exist", async () => {
      const dir = await makeDir();

      await expect(extractSchema({ translationsPath: path.join(dir, "missing") })).rejects.toThrow(
        /ENOENT/,
      );
    });
  });
});
