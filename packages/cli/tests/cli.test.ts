import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger } from "../src/utils/logger";
import type { ProjectSchema, GeneratorOptions } from "../src/types";
import { promises as nodeFs } from "fs";

/**
 * CLI command handler tests
 *
 * These tests exercise the actual command handler logic (ConfigLoader + TypeGenerator)
 * without mocking the classes themselves. Instead we inject test dependencies
 * (InMemoryFileSystem, CollectingReporter, SilentLogger) and mock only fetch.
 */

describe("CLI", () => {
  let mockFileSystem: InMemoryFileSystem;
  let mockWriter: FileSystemWriter;
  let mockReporter: CollectingReporter;
  let mockLogger: SilentLogger;

  const mockSchema: ProjectSchema = {
    keys: {
      "common:welcome": { params: [] },
      "common:greeting": {
        params: [{ name: "name", type: "string" }],
      },
    },
  };

  beforeEach(() => {
    mockFileSystem = new InMemoryFileSystem();
    mockWriter = new FileSystemWriter(mockFileSystem);
    mockReporter = new CollectingReporter();
    mockLogger = new SilentLogger();

    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("init command", () => {
    const tmpFiles: string[] = [];

    afterEach(async () => {
      for (const f of tmpFiles) {
        try {
          await nodeFs.unlink(f);
        } catch {
          // file may not exist
        }
      }
      tmpFiles.length = 0;
    });

    it("should create config file with provided options via ConfigLoader.create", async () => {
      const config = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.custom.com",
        outputPath: "custom/types/i18n.d.ts",
        strictParams: false,
      };

      // Use /tmp directly (guaranteed to exist) as output path
      const outputPath = "/tmp/.comvirc-test-cli-create.json";
      tmpFiles.push(outputPath);

      const filePath = await ConfigLoader.create(config, outputPath);

      expect(filePath).toBe(outputPath);

      // Verify file content
      const content = await nodeFs.readFile(outputPath);
      const parsed = JSON.parse(content);
      expect(parsed.apiKey).toBe("test-key");
      expect(parsed.apiBaseUrl).toBe("https://api.custom.com");
      expect(parsed.outputPath).toBe("custom/types/i18n.d.ts");
      expect(parsed.strictParams).toBe(false);
    });

    it("should merge default values for missing config options", async () => {
      const outputPath = "/tmp/.comvirc-test-cli-defaults.json";
      tmpFiles.push(outputPath);

      const filePath = await ConfigLoader.create({}, outputPath);

      expect(filePath).toBe(outputPath);

      // Verify default values were written
      const content = await nodeFs.readFile(outputPath);
      const parsed = JSON.parse(content);
      expect(parsed.apiKey).toBeUndefined();
      expect(parsed.apiBaseUrl).toBe("https://api.comvi.io");
      expect(parsed.outputPath).toBe("src/types/i18n.d.ts");
      expect(parsed.strictParams).toBe(true);
    });

    it("should convert config to generator options with correct defaults", () => {
      const config = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.custom.com",
      };

      const options = ConfigLoader.toGeneratorOptions(config as any);

      expect(options.apiKey).toBe("test-key");
      expect(options.apiBaseUrl).toBe("https://api.custom.com");
      expect(options.outputPath).toBe("src/types/i18n.d.ts");
      expect(options.strictParams).toBe(true);
      expect(options.defaultNsName).toBe("default");
    });

    it("should throw when converting config without apiKey", () => {
      expect(() => ConfigLoader.toGeneratorOptions({} as any)).toThrow("API key is required");
    });
  });

  describe("generate command", () => {
    it("should generate types successfully and write to file", async () => {
      // Mock fetch to return schema
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockSchema,
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);
      expect(result.filePath).toBe("src/types/i18n.d.ts");

      // Verify file was actually written
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("declare module '@comvi/core'");
      expect(written).toContain("interface TranslationKeys");
    });

    it("should generate an empty declaration file when no keys are found in schema", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ keys: {} }),
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);
    });

    it("should return failure result when API returns an error", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("should respect strictParams=false and produce optional params", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockSchema,
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: false,
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("name?: string");
    });
  });

  describe("watch command", () => {
    it("should regenerate types from schema update via generateFromSchema", async () => {
      // Mock fetch for initial generation
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockSchema,
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      // Simulate SSE callback: generateFromSchema with updated schema
      const updatedSchema: ProjectSchema = {
        keys: {
          "common:welcome": { params: [] },
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
          "common:new_key": {
            params: [{ name: "count", type: "number" }],
          },
        },
      };

      const updateResult = await generator.generateFromSchema(updatedSchema);

      expect(updateResult.success).toBe(true);
      expect(updateResult.keysGenerated).toBe(3);

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("'common:new_key'");
      expect(written).toContain("count: number");
    });
  });

  describe("common scenarios", () => {
    it("should handle network errors gracefully with failure result", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");

      // Verify error was reported
      const errorReport = mockReporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
    });

    it("should report all progress events during successful generation", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockSchema,
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await generator.generate();

      const reportTypes = mockReporter.reports.map((r) => r.type);
      expect(reportTypes).toContain("start");
      expect(reportTypes).toContain("fetching");
      expect(reportTypes).toContain("generating");
      expect(reportTypes).toContain("success");
    });
  });
});
