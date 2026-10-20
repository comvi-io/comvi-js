import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ts from "typescript";
import { TypeEmitter } from "../src/core/TypeEmitter";
import { ErrorCodes } from "../src/utils/errors";
import type { ProjectSchema } from "../src/types";

/** Syntax errors in the emitted declarations, as TypeScript reports them. */
function syntacticDiagnosticsOf(source: string): string[] {
  const { diagnostics = [] } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });

  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  );
}

/** The emitted `TranslationKeys` member lines, in emitted order, without indentation. */
function keyLinesOf(output: string): string[] {
  return (output.match(/^ {4}\S.*$/gm) ?? []).map((line) => line.trim());
}

/** Schema keys are flat, with a colon separating namespace from key. */
describe("TypeEmitter", () => {
  let typeEmitter: TypeEmitter;

  beforeEach(() => {
    typeEmitter = new TypeEmitter();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(result).toContain('"common:greeting": { "name": string | number };');
      expect(result).toContain('"common:welcome": never;');
      expect(result).toContain("DO NOT EDIT");
    });

    it("should generate flat keys with colon namespace separator", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:hello": { params: [] },
          "auth:login": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain('"auth:login": never;');
      expect(result).toContain('"common:hello": never;');
      expect(result).not.toContain('"common": {');
      expect(result).not.toContain('"auth": {');
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

      expect(keyLinesOf(result)).toEqual([
        '"alpha:key": never;',
        '"beta:key": never;',
        '"zebra:key": never;',
      ]);
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

      expect(keyLinesOf(result)).toEqual([
        '"common:apple": never;',
        '"common:banana": never;',
        '"common:zebra": never;',
      ]);
    });

    it("stamps no timestamp, so regenerating an unchanged schema rewrites the same bytes", () => {
      vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
      const schema: ProjectSchema = {
        keys: {
          "test:key": { params: [] },
        },
      };

      const first = typeEmitter.generate(schema);
      vi.setSystemTime(Date.UTC(2027, 5, 15));
      const second = typeEmitter.generate(schema);

      expect(first).not.toContain("Generated at:");
      expect(second).toBe(first);
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

      expect(result).toContain('"common:items": { "count": number };');
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

      expect(result).toContain('"common:greeting": { "name": string | number };');
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

      expect(result).toContain(
        '"common:hello": { "name"?: string | number; "title"?: string | number };',
      );
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

      expect(result).toContain('"common:hello": { "name": string | number };');
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

      expect(result).toContain('"hello": never;');
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

      expect(result).toContain('"common:nested.deep.key": { "value": string | number };');
    });

    it("should handle keys with special characters", () => {
      const schema: ProjectSchema = {
        keys: {
          "common:key-with-dashes": { params: [] },
          "common:key_with_underscores": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain('"common:key-with-dashes": never;');
      expect(result).toContain('"common:key_with_underscores": never;');
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

      expect(result).toContain('"test:class": never;');
      expect(result).toContain('"test:interface": never;');
      expect(result).toContain('"test:type": never;');
    });

    it("should handle very long keys", () => {
      const longKey = "a".repeat(500);
      const schema: ProjectSchema = {
        keys: {
          [`test:${longKey}`]: { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain(`"test:${longKey}": never;`);
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

      expect(result).toContain('"test:emoji_😀": never;');
      expect(result).toContain('"test:chinese_你好": never;');
      expect(result).toContain('"test:arabic_مرحبا": never;');
    });

    it("should handle very large number of keys", () => {
      const keys: ProjectSchema["keys"] = {};
      for (let i = 0; i < 1000; i++) {
        keys[`test:key${i}`] = { params: [] };
      }
      const schema: ProjectSchema = { keys };

      const result = typeEmitter.generate(schema);

      const lines = keyLinesOf(result);
      expect(lines).toHaveLength(1000);
      expect(lines[0]).toBe('"test:key0": never;');
      expect(lines.at(-1)).toBe('"test:key999": never;');
    });

    it.each([
      {
        name: "several string params",
        params: [
          { name: "firstName", type: "string" as const },
          { name: "lastName", type: "string" as const },
        ],
        expected: '"test:key": { "firstName": string | number; "lastName": string | number };',
      },
      {
        name: "mixed string and number params",
        params: [
          { name: "name", type: "string" as const },
          { name: "count", type: "number" as const },
          { name: "price", type: "number" as const },
        ],
        expected: '"test:key": { "name": string | number; "count": number; "price": number };',
      },
      {
        name: "ten params",
        params: Array.from({ length: 10 }, (_, i) => ({
          name: `param${i}`,
          type: "string" as const,
        })),
        expected: `"test:key": { ${Array.from({ length: 10 }, (_, i) => `"param${i}": string | number`).join("; ")} };`,
      },
    ])("should render $name in declaration order", ({ params, expected }) => {
      const schema: ProjectSchema = { keys: { "test:key": { params } } };

      const result = typeEmitter.generate(schema);

      expect(keyLinesOf(result)).toEqual([expected]);
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

      expect(result).toContain('"greeting": { "name": string | number };');
      expect(result).toContain('"welcome": never;');

      expect(result).toContain('"admin:dashboard": never;');
      expect(result).toContain('"errors:not_found": { "code": number };');

      expect(result).not.toContain('"default:welcome"');
      expect(result).not.toContain('"default:greeting"');
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

      expect(result).toContain('"goodbye": never;');
      expect(result).toContain('"hello": never;');

      expect(result).toContain('"auth:login": never;');

      expect(result).not.toContain('"common:hello"');
      expect(result).not.toContain('"common:goodbye"');
    });

    it("should strip the conventional 'default' namespace when none is configured", () => {
      const schema: ProjectSchema = {
        keys: {
          "default:home.title": { params: [] },
          "admin:dashboard": { params: [] },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(result).toContain('"home.title": never;');
      expect(result).not.toContain('"default:home.title"');
      expect(result).toContain('"admin:dashboard": never;');
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

    it("emits one declaration line per key, wrapped in the module augmentation", () => {
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

      expect(result).toBe(
        [
          "/**",
          " * Auto-generated translation keys, augmenting '@comvi/core'",
          " * DO NOT EDIT — this file is generated from your translation schema",
          " */",
          "",
          "// Import to ensure module is resolved before augmentation",
          "import '@comvi/core';",
          "",
          "declare module '@comvi/core' {",
          "  interface TranslationKeys {",
          '    "admin:dashboard": never;',
          '    "common:greeting": { "name": string | number };',
          '    "common:items": { "count": number };',
          '    "common:welcome": never;',
          "  }",
          "}",
          "",
          "export {};",
          "",
        ].join("\n"),
      );
    });
  });

  describe("escaping and validation", () => {
    it("should emit a syntactically valid file for a key containing an apostrophe", () => {
      const schema: ProjectSchema = {
        keys: { "admin:errors.it's": { params: [] } },
      };

      const result = typeEmitter.generate(schema);

      expect(syntacticDiagnosticsOf(result)).toEqual([]);
    });

    it("should quote a param name that is not a bare identifier", () => {
      const schema: ProjectSchema = {
        keys: { "admin:greeting": { params: [{ name: "user-name", type: "string" }] } },
      };

      const result = typeEmitter.generate(schema);

      expect(keyLinesOf(result)).toEqual(['"admin:greeting": { "user-name": string | number };']);
    });

    it("should emit a syntactically valid file for a param name that is not a bare identifier", () => {
      const schema: ProjectSchema = {
        keys: { "admin:greeting": { params: [{ name: "user-name", type: "string" }] } },
      };

      const result = typeEmitter.generate(schema);

      expect(syntacticDiagnosticsOf(result)).toEqual([]);
    });

    it("should reject a param type the emitter cannot express, naming key, param and type", () => {
      const schema: ProjectSchema = {
        keys: {
          "admin:greeting": {
            params: [{ name: "onDone", type: "() => void" as unknown as "string" }],
          },
        },
      };

      expect(() => typeEmitter.generate(schema)).toThrow(
        expect.objectContaining({ code: ErrorCodes.VALIDATION_FAILED }),
      );
      expect(() => typeEmitter.generate(schema)).toThrow(/admin:greeting.*onDone.*\(\) => void/);
    });

    it("should accept the two param types it can express", () => {
      const schema: ProjectSchema = {
        keys: {
          "admin:greeting": {
            params: [
              { name: "name", type: "string" },
              { name: "count", type: "number" },
            ],
          },
        },
      };

      const result = typeEmitter.generate(schema);

      expect(keyLinesOf(result)).toEqual([
        '"admin:greeting": { "name": string | number; "count": number };',
      ]);
    });
  });
});
