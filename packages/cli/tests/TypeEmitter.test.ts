import { describe, it, expect, beforeEach } from "vitest";
import { TypeEmitter } from "../src/core/TypeEmitter";
import type { ProjectSchema } from "../src/types";

/**
 * TypeEmitter Tests
 *
 * Tests for generating TypeScript declaration files from ProjectSchema.
 * Key format: "namespace:key" (colon separator)
 */
describe("TypeEmitter", () => {
  let typeEmitter: TypeEmitter;

  beforeEach(() => {
    typeEmitter = new TypeEmitter();
  });

  describe("generate", () => {
    it("should generate complete declaration file", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:welcome": { params: [] },
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("declare module '@comvi/core'");
      expect(result).toContain("interface TranslationKeys");
      // Keys are flat with colon separator: "namespace:key"
      expect(result).toContain("'common:greeting': { name: string };");
      expect(result).toContain("'common:welcome': never;");
      // @comvi/vue and @comvi/react re-export from @comvi/core,
      // so augmenting @comvi/core is sufficient
      expect(result).toContain("DO NOT EDIT MANUALLY");
    });

    it("should generate flat keys with colon namespace separator", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:hello": { params: [] },
          "auth:login": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      // Keys are flat with colon: "namespace:key"
      expect(result).toContain("'auth:login': never;");
      expect(result).toContain("'common:hello': never;");
      // Should NOT have nested structure
      expect(result).not.toContain("'common': {");
      expect(result).not.toContain("'auth': {");
    });

    it("should sort keys alphabetically", () => {
      const schema: ProjectSchema = {
        keys: {
          "zebra:key": { params: [] },
          "alpha:key": { params: [] },
          "beta:key": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      // Keys are sorted alphabetically
      const alphaIndex = result.indexOf("'alpha:key'");
      const betaIndex = result.indexOf("'beta:key'");
      const zebraIndex = result.indexOf("'zebra:key'");

      expect(alphaIndex).toBeLessThan(betaIndex);
      expect(betaIndex).toBeLessThan(zebraIndex);
    });

    it("should sort keys from same namespace alphabetically", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:zebra": { params: [] },
          "common:apple": { params: [] },
          "common:banana": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      // Keys sorted: common:apple, common:banana, common:zebra
      const appleIndex = result.indexOf("'common:apple'");
      const bananaIndex = result.indexOf("'common:banana'");
      const zebraIndex = result.indexOf("'common:zebra'");

      expect(appleIndex).toBeLessThan(bananaIndex);
      expect(bananaIndex).toBeLessThan(zebraIndex);
    });

    it("should include generation timestamp", () => {
      const schema: ProjectSchema = {
        keys: {
          "test:key": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toMatch(/Generated at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should generate number type for number parameters", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:items": {
            params: [{ name: "count", type: "number" }],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'common:items': { count: number };");
    });

    it("should generate string type for string parameters", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'common:greeting': { name: string };");
    });

    it("should generate optional params when strictParams is false", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:hello": {
            params: [
              { name: "name", type: "string" },
              { name: "title", type: "string" },
            ],
          },
        },
      };

      const result = typeEmitter.generate(schema, { strictParams: false });

      expect(result).toContain("'common:hello': { name?: string; title?: string };");
    });

    it("should generate required params when strictParams is true", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:hello": {
            params: [{ name: "name", type: "string" }],
          },
        },
      };

      const result = typeEmitter.generate(schema, { strictParams: true });

      expect(result).toContain("'common:hello': { name: string };");
      expect(result).not.toContain("name?:");
    });

    it("should handle empty schema", () => {
      const schema: ProjectSchema = { keys: {} };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("declare module '@comvi/core'");
      expect(result).toContain("interface TranslationKeys {");
    });

    it("should handle keys without namespace prefix", () => {
      const schema: ProjectSchema = {
        keys: {
          hello: { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'hello': never;");
    });

    it("should handle nested keys after namespace", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:nested.deep.key": {
            params: [{ name: "value", type: "string" }],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      // Key preserves dots within the key part, colon separates namespace
      expect(result).toContain("'common:nested.deep.key': { value: string };");
    });

    it("should handle keys with special characters", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:key-with-dashes": { params: [] },
          "common:key_with_underscores": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'common:key-with-dashes': never;");
      expect(result).toContain("'common:key_with_underscores': never;");
    });

    it("should handle multiple parameters", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:complex": {
            params: [
              { name: "firstName", type: "string" },
              { name: "lastName", type: "string" },
              { name: "age", type: "number" },
            ],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("firstName: string");
      expect(result).toContain("lastName: string");
      expect(result).toContain("age: number");
    });

    it("should handle keys that are TypeScript reserved words", () => {
      const schema: ProjectSchema = {
        keys: {
          "test:class": { params: [] },
          "test:interface": { params: [] },
          "test:type": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'test:class': never;");
      expect(result).toContain("'test:interface': never;");
      expect(result).toContain("'test:type': never;");
    });

    it("should handle very long keys", () => {
      const longKey = "a".repeat(500);
      const schema: ProjectSchema = {
        keys: {
          [`test:${longKey}`]: { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain(`'test:${longKey}': never;`);
    });

    it("should handle Unicode characters in keys", () => {
      const schema: ProjectSchema = {
        keys: {
          "test:emoji_😀": { params: [] },
          "test:chinese_你好": { params: [] },
          "test:arabic_مرحبا": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'test:emoji_😀': never;");
      expect(result).toContain("'test:chinese_你好': never;");
      expect(result).toContain("'test:arabic_مرحبا': never;");
    });

    it("should handle very large number of keys", () => {
      const keys: ProjectSchema["keys"] = {};
      for (let i = 0; i < 1000; i++) {
        keys[`test:key${i}`] = { params: [] };
      }
      const schema: ProjectSchema = { keys };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("'test:key0': never;");
      expect(result).toContain("'test:key999': never;");
    });

    it("should handle keys with many parameters", () => {
      const params = Array.from({ length: 10 }, (_, i) => ({
        name: `param${i}`,
        type: "string" as const,
      }));

      const schema: ProjectSchema = {
        keys: {
          "test:many": { params },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("param0: string");
      expect(result).toContain("param9: string");
    });

    it("should handle mixed parameter types", () => {
      const schema: ProjectSchema = {
        keys: {
          "test:mixed": {
            params: [
              { name: "name", type: "string" },
              { name: "count", type: "number" },
              { name: "price", type: "number" },
            ],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain("name: string");
      expect(result).toContain("count: number");
      expect(result).toContain("price: number");
    });

    it("should strip default namespace prefix from keys", () => {
      const schema: ProjectSchema = {
        keys: {
          "default:welcome": { params: [] },
          "default:greeting": {
            params: [{ name: "name", type: "string" }],
          },
          "admin:dashboard": { params: [] },
          "errors:not_found": { params: [{ name: "code", type: "number" }] },
        },
      };

      const result = typeEmitter.generate(schema, { defaultNsName: "default" });

      // Keys from the default namespace should have their prefix stripped
      expect(result).toContain("'greeting': { name: string };");
      expect(result).toContain("'welcome': never;");

      // Keys from non-default namespaces should keep their prefix
      expect(result).toContain("'admin:dashboard': never;");
      expect(result).toContain("'errors:not_found': { code: number };");

      // The stripped keys should NOT appear with their original prefix
      expect(result).not.toContain("'default:welcome'");
      expect(result).not.toContain("'default:greeting'");
    });

    it("should strip custom default namespace prefix when configured", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:hello": { params: [] },
          "common:goodbye": { params: [] },
          "auth:login": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema, { defaultNsName: "common" });

      // Keys from custom default namespace should have prefix stripped
      expect(result).toContain("'goodbye': never;");
      expect(result).toContain("'hello': never;");

      // Non-default namespace keys keep their prefix
      expect(result).toContain("'auth:login': never;");

      // Original prefixed keys should not appear
      expect(result).not.toContain("'common:hello'");
      expect(result).not.toContain("'common:goodbye'");
    });

    it("should reject key collisions after stripping the default namespace prefix", () => {
      const schema: ProjectSchema = {
        keys: {
          "default:greeting:foo": { params: [] },
          "greeting:foo": { params: [] },
        },
      };

      expect(() => typeEmitter.generate(schema, { defaultNsName: "default" })).toThrow(
        "Translation key collision after stripping default namespace",
      );
    });

    it("should generate syntactically valid TypeScript declaration output", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:welcome": { params: [] },
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
          "common:items": {
            params: [{ name: "count", type: "number" }],
          },
          "admin:dashboard": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      // Verify the overall structure is valid TypeScript declaration syntax
      // 1. Must start with comment header and import statement
      expect(result).toMatch(/^\/\*\*[\s\S]*?\*\//);
      expect(result).toContain("import '@comvi/core';");

      // 2. Must have proper module declaration block
      expect(result).toMatch(/declare module '@comvi\/core' \{/);
      expect(result).toMatch(/\s+interface TranslationKeys \{/);

      // 3. Each key line must follow valid TypeScript interface member syntax
      // Pattern: '  'key': never;' or '  'key': { param: type; ... };'
      const keyLinePattern = /^\s+'[^']+': (never|\{[^}]+\});$/gm;
      const keyLines = result.match(keyLinePattern);
      expect(keyLines).not.toBeNull();
      expect(keyLines!.length).toBe(4);

      // 4. Must close properly with } and export {}
      expect(result).toMatch(/\s+\}\n\}\n/);
      expect(result).toContain("export {};");

      // 5. Braces must be balanced
      const openBraces = (result.match(/\{/g) || []).length;
      const closeBraces = (result.match(/\}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });
  });
});
