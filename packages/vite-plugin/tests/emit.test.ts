import { describe, it, expect } from "vitest";
import ts from "typescript";
import { emitDeclarations as emitShared } from "@comvi/typegen";
import { emitDeclarations } from "../src/emit";
import type { ProjectSchema } from "../src/extract";

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

describe("emitDeclarations", () => {
  it("should generate valid .d.ts with keys", () => {
    const schema: ProjectSchema = {
      keys: {
        "common:greeting": { params: [{ name: "name", type: "string" }] },
        "common:logout": { params: [] },
        "admin:dashboard": { params: [] },
      },
    };

    const result = emitDeclarations(schema, { defaultNs: "common" });

    expect(result).toBe(
      [
        "/**",
        " * Auto-generated translation keys",
        " * DO NOT EDIT — this file is generated from your translation schema",
        " */",
        "",
        "// Import to ensure module is resolved before augmentation",
        "import '@comvi/core';",
        "",
        "declare module '@comvi/core' {",
        "  interface TranslationKeys {",
        '    "admin:dashboard": never;',
        '    "greeting": { "name": string };',
        '    "logout": never;',
        "  }",
        "}",
        "",
        "export {};",
        "",
      ].join("\n"),
    );
  });

  it("emits the empty skeleton for a schema with no keys", () => {
    const result = emitDeclarations({ keys: {} });

    expect(keyLinesOf(result)).toEqual([]);
    expect(result).toContain("  interface TranslationKeys {\n  }");
    expect(result).toContain("export {};");
  });

  it("should strip default namespace prefix", () => {
    const schema: ProjectSchema = {
      keys: {
        "default:title": { params: [] },
        "admin:title": { params: [] },
      },
    };

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"admin:title": never;', '"title": never;']);
  });

  it("should handle plural params as number", () => {
    const schema: ProjectSchema = {
      keys: {
        "default:items": {
          params: [{ name: "count", type: "number" }],
        },
      },
    };

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"items": { "count": number };']);
  });

  it("should make params optional when strictParams is false", () => {
    const schema: ProjectSchema = {
      keys: {
        "default:greeting": {
          params: [{ name: "name", type: "string" }],
        },
      },
    };

    const result = emitDeclarations(schema, { strictParams: false });

    expect(keyLinesOf(result)).toEqual(['"greeting": { "name"?: string };']);
  });

  it("should sort keys alphabetically", () => {
    const schema: ProjectSchema = {
      keys: {
        "default:zebra": { params: [] },
        "default:alpha": { params: [] },
        "default:middle": { params: [] },
      },
    };

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"alpha": never;', '"middle": never;', '"zebra": never;']);
  });

  it("should emit stable output for unchanged schema", () => {
    const schema: ProjectSchema = {
      keys: {
        "default:greeting": {
          params: [{ name: "name", type: "string" }],
        },
      },
    };

    const first = emitDeclarations(schema);
    const second = emitDeclarations(schema);

    expect(first).toBe(second);
    expect(first).not.toContain("Generated at:");
  });

  it("should emit a syntactically valid file for a key containing an apostrophe", () => {
    const schema: ProjectSchema = {
      keys: { "admin:errors.it's": { params: [] } },
    };

    const result = emitDeclarations(schema);

    expect(syntacticDiagnosticsOf(result)).toEqual([]);
  });

  it("should quote a param name that is not a bare identifier", () => {
    const schema: ProjectSchema = {
      keys: { "admin:greeting": { params: [{ name: "user-name", type: "string" }] } },
    };

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"admin:greeting": { "user-name": string };']);
  });

  it("should emit a syntactically valid file for a param name that is not a bare identifier", () => {
    const schema: ProjectSchema = {
      keys: { "admin:greeting": { params: [{ name: "user-name", type: "string" }] } },
    };

    const result = emitDeclarations(schema);

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

    expect(() => emitDeclarations(schema)).toThrow(/admin:greeting.*onDone.*\(\) => void/);
  });

  it("separates several params of one key with a semicolon", () => {
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

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"admin:greeting": { "name": string; "count": number };']);
  });

  it("writes the tool-neutral header, byte-identical to the shared emitter's output", () => {
    // A project that generates with `comvi typegen` in CI and with this plugin
    // in dev has to get the same bytes: `TypeGenerator.check` compares them
    // literally, so a per-tool header line reported drift on every check.
    const schema: ProjectSchema = {
      keys: { "admin:dashboard": { params: [{ name: "count", type: "number" }] } },
    };

    expect(emitDeclarations(schema, { defaultNs: "admin" })).toBe(
      emitShared(schema, { defaultNs: "admin" }),
    );
  });

  it("delegates to @comvi/typegen, adding nothing of its own", () => {
    const schema: ProjectSchema = {
      keys: { "admin:dashboard": { params: [{ name: "count", type: "number" }] } },
    };

    expect(emitDeclarations(schema, { defaultNs: "admin", strictParams: false })).toBe(
      emitShared(schema, {
        defaultNs: "admin",
        strictParams: false,
      }),
    );
  });

  it("refuses two keys that collide once the default namespace is stripped", () => {
    // The plugin used to keep whichever key came last, so a key vanished from
    // the declarations and the project found out at the call site.
    const schema: ProjectSchema = {
      keys: {
        "default:title": { params: [] },
        title: { params: [{ name: "name", type: "string" }] },
      },
    };

    expect(() => emitDeclarations(schema)).toThrow(
      "Translation key collision after stripping default namespace 'default'",
    );
  });

  it("should order keys by code unit, not by locale", () => {
    const schema: ProjectSchema = {
      keys: {
        "admin:apple": { params: [] },
        "admin:Zed": { params: [] },
      },
    };

    const result = emitDeclarations(schema);

    expect(keyLinesOf(result)).toEqual(['"admin:Zed": never;', '"admin:apple": never;']);
  });
});
