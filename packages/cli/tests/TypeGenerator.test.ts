import { describe, it, expect, vi, beforeEach } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ApiClient } from "../src/core/ApiClient";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger, type Logger } from "../src/utils/logger";
import type { GeneratorOptions, ProjectSchema } from "../src/types";

vi.mock("../src/core/ApiClient");

describe("TypeGenerator", () => {
  let generator: TypeGenerator;
  let mockOptions: GeneratorOptions;
  let mockFileSystem: InMemoryFileSystem;
  let mockWriter: FileSystemWriter;
  let mockReporter: CollectingReporter;
  let mockLogger: Logger;

  // Mock schema data for the schema endpoint
  const mockSchema: ProjectSchema = {
    keys: {
      "common:welcome": { params: [] },
      "common:greeting": {
        params: [{ name: "name", type: "string" }],
      },
    },
  };

  beforeEach(() => {
    mockOptions = {
      apiKey: "test-api-key",
      apiBaseUrl: "https://api.test.com",
      outputPath: "src/types/i18n.d.ts",
      strictParams: true,
    };

    vi.clearAllMocks();

    // Create mock dependencies
    mockFileSystem = new InMemoryFileSystem();
    mockWriter = new FileSystemWriter(mockFileSystem);
    mockReporter = new CollectingReporter();
    mockLogger = new SilentLogger();

    // Setup API client mocks
    const mockApiClient = vi.mocked(ApiClient);
    mockApiClient.prototype.validateConnection = vi.fn().mockResolvedValue(true);
    mockApiClient.prototype.fetchSchema = vi.fn().mockResolvedValue(mockSchema);

    // Create generator with injected dependencies
    generator = new TypeGenerator(mockOptions, {
      writer: mockWriter,
      reporter: mockReporter,
      logger: mockLogger,
    });
  });

  describe("constructor", () => {
    it("should apply default strictParams=true when not provided", async () => {
      const minimalOptions: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "types/i18n.d.ts",
      };

      const gen = new TypeGenerator(minimalOptions, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await gen.generate();

      // Verify strictParams defaults to true by checking the generated output
      // With strictParams=true, params should be required (no ? suffix)
      const written = mockFileSystem.getFile("types/i18n.d.ts");
      expect(written).toContain("name: string");
      expect(written).not.toContain("name?: string");
    });

    it("should apply strictParams=false when explicitly provided", async () => {
      const customOptions: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "types/i18n.d.ts",
        strictParams: false,
      };

      const gen = new TypeGenerator(customOptions, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await gen.generate();

      // Verify strictParams=false produces optional params in the output
      const written = mockFileSystem.getFile("types/i18n.d.ts");
      expect(written).toContain("name?: string");
    });
  });

  describe("validateConnection", () => {
    it("should return false for failed connection", async () => {
      vi.mocked(ApiClient.prototype.validateConnection).mockResolvedValueOnce(false);

      const result = await generator.validateConnection();

      expect(result).toBe(false);
    });

    it("should return false when ApiClient throws an error", async () => {
      vi.mocked(ApiClient.prototype.validateConnection).mockRejectedValueOnce(
        new Error("Network unreachable"),
      );

      const result = await generator.validateConnection();

      expect(result).toBe(false);
    });
  });

  describe("generate", () => {
    it("should generate types successfully", async () => {
      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("src/types/i18n.d.ts");
      expect(result.keysGenerated).toBe(2); // 2 keys in mockSchema
      expect(result.duration).toBeGreaterThanOrEqual(0);

      expect(ApiClient.prototype.fetchSchema).toHaveBeenCalled();

      // Verify the actual generated content was written to the filesystem
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("interface TranslationKeys");
      expect(written).toContain("'common:welcome': never;");
      expect(written).toContain("'common:greeting': { name: string };");

      // Check reporter received correct events
      expect(mockReporter.reports).toContainEqual({ type: "start" });
      expect(mockReporter.reports).toContainEqual({ type: "fetching" });
      expect(mockReporter.reports).toContainEqual({ type: "generating" });
      expect(mockReporter.reports).toContainEqual({
        type: "success",
        data: {
          keysGenerated: 2,
          duration: expect.any(Number),
          filePath: "src/types/i18n.d.ts",
        },
      });
    });

    it("should generate an empty declaration file if no translation keys are found", async () => {
      // Empty schema = no keys
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
        keys: {},
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("interface TranslationKeys");
    });

    it("should create output directory if it doesn't exist", async () => {
      await generator.generate();

      // Check that directory exists in in-memory filesystem
      expect(
        mockFileSystem.hasDirectory("/src/types") || mockFileSystem.hasDirectory("src/types"),
      ).toBe(true);
    });

    it("should handle file write errors", async () => {
      // Make in-memory filesystem throw error
      const failingWriter = new FileSystemWriter({
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockRejectedValue(new Error("Disk full")),
        readFile: vi.fn(),
        access: vi.fn(),
      });

      const genWithFailingWriter = new TypeGenerator(mockOptions, {
        writer: failingWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await genWithFailingWriter.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Disk full");
    });

    it("should handle API fetch errors", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce(new Error("Network error"));

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle TypeEmitter errors", async () => {
      // Provide a schema that causes TypeEmitter to throw by making
      // apiClient return a malformed schema where keys is not iterable
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
        keys: null as any,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("null");
    });

    it("should report errors on failure", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce(new Error("Test error"));

      await generator.generate();

      const errorReport = mockReporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
    });

    it("should handle unknown errors gracefully", async () => {
      // Throw non-Error object
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce("String error");

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
    });
  });

  describe("generateFromSchema", () => {
    it("should generate types from pre-fetched schema", async () => {
      const schema: ProjectSchema = {
        keys: {
          "custom:key1": { params: [] },
          "custom:key2": { params: [{ name: "id", type: "number" }] },
        },
      };

      const result = await generator.generateFromSchema(schema);

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);

      // Verify the actual generated content
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("'custom:key1': never;");
      expect(written).toContain("id: number");
    });

    it("should generate types for an empty schema", async () => {
      const schema: ProjectSchema = { keys: {} };

      const result = await generator.generateFromSchema(schema);

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);
    });
  });

  describe("integration scenarios", () => {
    it("should handle generation with multiple namespaces", async () => {
      const multiNsSchema: ProjectSchema = {
        keys: {
          "common:welcome": { params: [] },
          "dashboard:title": { params: [] },
        },
      };

      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce(multiNsSchema);

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);
    });

    it("should handle generation with complex parameter types", async () => {
      const complexSchema: ProjectSchema = {
        keys: {
          "common:greeting": {
            params: [{ name: "name", type: "string" }],
          },
          "common:items": {
            params: [{ name: "count", type: "number" }],
          },
        },
      };

      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce(complexSchema);

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);

      // Verify the generated output contains the complex parameter types
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("name: string");
      expect(written).toContain("count: number");
    });

    it("should measure generation time accurately", async () => {
      // Add small delay to ensure measurable time
      vi.mocked(ApiClient.prototype.fetchSchema).mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockSchema;
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should pass strictParams option to TypeEmitter", async () => {
      const optionsWithConfig: GeneratorOptions = {
        ...mockOptions,
        strictParams: false,
      };

      const genWithConfig = new TypeGenerator(optionsWithConfig, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await genWithConfig.generate();

      // Verify the output reflects strictParams=false (optional params)
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("name?: string");
    });
  });
});
