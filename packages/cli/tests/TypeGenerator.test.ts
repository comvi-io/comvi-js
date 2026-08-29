import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

    mockFileSystem = new InMemoryFileSystem();
    mockWriter = new FileSystemWriter(mockFileSystem);
    mockReporter = new CollectingReporter();
    mockLogger = new SilentLogger();

    vi.mocked(ApiClient.prototype.validateConnection).mockResolvedValue(true);
    vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValue(mockSchema);
    vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockResolvedValue("default");

    generator = new TypeGenerator(mockOptions, {
      writer: mockWriter,
      reporter: mockReporter,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

      expect(mockFileSystem.getFile("types/i18n.d.ts")).toContain("name?: string");
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
    it("should return success and the generated key count", async () => {
      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("src/types/i18n.d.ts");
      expect(result.keysGenerated).toBe(2);

      expect(ApiClient.prototype.fetchSchema).toHaveBeenCalled();
      expect(ApiClient.prototype.fetchDefaultNamespace).toHaveBeenCalled();
    });

    it("should write the declaration file for every schema key", async () => {
      await generator.generate();

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("interface TranslationKeys");
      expect(written).toContain("'common:welcome': never;");
      expect(written).toContain("'common:greeting': { name: string };");
    });

    it("should report start, fetching, generating and success in order", async () => {
      await generator.generate();

      expect(mockReporter.reports.map((r) => r.type)).toEqual([
        "start",
        "fetching",
        "generating",
        "success",
      ]);
      expect(mockReporter.reports.at(-1)).toEqual({
        type: "success",
        data: {
          keysGenerated: 2,
          duration: expect.any(Number),
          filePath: "src/types/i18n.d.ts",
        },
      });
    });

    it("should generate an empty declaration file if no translation keys are found", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({ keys: {} });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);
      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain("interface TranslationKeys");
    });

    it("should strip the namespace marked default by the backend", async () => {
      vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockResolvedValueOnce("common");

      const result = await generator.generate();

      expect(result.success).toBe(true);
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("'welcome': never;");
      expect(written).toContain("'greeting': { name: string };");
      expect(written).not.toContain("'common:welcome': never;");
    });

    it("should create output directory if it doesn't exist", async () => {
      await generator.generate();

      expect(mockFileSystem.hasDirectory("/src/types")).toBe(true);
    });

    it("should handle file write errors", async () => {
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
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
        keys: {
          "default:greeting": { params: [] },
          greeting: { params: [] },
        },
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Translation key collision after stripping default namespace");
    });

    it("should report errors on failure", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce(new Error("Test error"));

      await generator.generate();

      const errorReport = mockReporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
    });

    it("should handle unknown errors gracefully", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce("String error");

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
    });

    it("should handle generation with multiple namespaces", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
        keys: {
          "common:welcome": { params: [] },
          "dashboard:title": { params: [] },
        },
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);
      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("'common:welcome': never;");
      expect(written).toContain("'dashboard:title': never;");
    });

    it("should handle generation with complex parameter types", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
        keys: {
          "common:greeting": { params: [{ name: "name", type: "string" }] },
          "common:items": { params: [{ name: "count", type: "number" }] },
        },
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("name: string");
      expect(written).toContain("count: number");
    });

    it("should measure generation time accurately", async () => {
      vi.useFakeTimers();
      vi.mocked(ApiClient.prototype.fetchSchema).mockImplementationOnce(async () => {
        vi.advanceTimersByTime(10);
        return mockSchema;
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.duration).toBe(10);
    });
  });

  describe("check", () => {
    it("reports up to date when the file on disk matches the generated output", async () => {
      await generator.generate();

      const result = await generator.check();

      expect(result).toEqual({
        upToDate: true,
        keysGenerated: 2,
        currentKeys: 2,
        filePath: "src/types/i18n.d.ts",
      });
    });

    it("ignores the Generated at: line when comparing", async () => {
      await generator.generate();
      const current = mockFileSystem.getFile("src/types/i18n.d.ts")!;
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        current.replace(/Generated at: .*/, "Generated at: 1999-01-01T00:00:00.000Z"),
      );

      await expect(generator.check()).resolves.toMatchObject({ upToDate: true });
    });

    it("reports drift when the file on disk is missing a key", async () => {
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        [
          "declare module '@comvi/core' {",
          "  interface TranslationKeys {",
          "    'common:welcome': never;",
          "  }",
          "}",
        ].join("\n"),
      );

      const result = await generator.check();

      expect(result).toEqual({
        upToDate: false,
        keysGenerated: 2,
        currentKeys: 1,
        filePath: "src/types/i18n.d.ts",
      });
    });

    it("reports not up to date when the output file does not exist", async () => {
      const result = await generator.check();

      expect(result).toEqual({
        upToDate: false,
        keysGenerated: 2,
        currentKeys: 0,
        filePath: "src/types/i18n.d.ts",
      });
    });

    it("propagates a schema fetch failure instead of reporting drift", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce(new Error("Network error"));

      await expect(generator.check()).rejects.toThrow("Network error");
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

      const written = mockFileSystem.getFile("src/types/i18n.d.ts");
      expect(written).toContain("'custom:key1': never;");
      expect(written).toContain("id: number");
    });

    it("should reuse the resolved default namespace for subsequent schema updates", async () => {
      await generator.generate();
      vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockClear();

      const schema: ProjectSchema = {
        keys: {
          "common:updated": { params: [] },
        },
      };

      const result = await generator.generateFromSchema(schema);

      expect(result.success).toBe(true);
      expect(ApiClient.prototype.fetchDefaultNamespace).not.toHaveBeenCalled();
    });

    it("retries the default namespace lookup after it rejected", async () => {
      // The cached promise is cleared on rejection, so a later call must ask again
      // instead of replaying the failure forever in watch mode.
      vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockRejectedValueOnce(
        new Error("Namespace lookup failed"),
      );
      const schema: ProjectSchema = { keys: { "common:updated": { params: [] } } };

      const failed = await generator.generateFromSchema(schema);
      const retried = await generator.generateFromSchema(schema);

      expect(failed.success).toBe(false);
      expect(retried.success).toBe(true);
      expect(ApiClient.prototype.fetchDefaultNamespace).toHaveBeenCalledTimes(2);
    });

    it("should generate types for an empty schema", async () => {
      const schema: ProjectSchema = { keys: {} };

      const result = await generator.generateFromSchema(schema);

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);
    });
  });
});
