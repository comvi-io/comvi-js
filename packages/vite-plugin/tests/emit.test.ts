import { describe, it, expect } from "vitest";
import { emitDeclarations } from "../src/emit";
import type { ProjectSchema } from "../src/extract";

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

    expect(result).toContain("interface TranslationKeys");
    expect(result).toContain("'greeting': { name: string };");
    expect(result).toContain("'logout': never;");
    expect(result).toContain("'admin:dashboard': never;");
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

    expect(result).toContain("'title': never;");
    expect(result).toContain("'admin:title': never;");
    expect(result).not.toContain("'default:title'");
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

    expect(result).toContain("'items': { count: number };");
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

    expect(result).toContain("'greeting': { name?: string };");
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
    const alphaIdx = result.indexOf("'alpha'");
    const middleIdx = result.indexOf("'middle'");
    const zebraIdx = result.indexOf("'zebra'");

    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);
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
});
