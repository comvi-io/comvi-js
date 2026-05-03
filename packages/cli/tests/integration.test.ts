import { describe, it, expect, beforeEach, vi } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ApiClient } from "../src/core/ApiClient";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger } from "../src/utils/logger";
import type { GeneratorOptions, ProjectSchema } from "../src/types";

// Mock ApiClient only (network calls) - TypeEmitter runs for real
vi.mock("../src/core/ApiClient");

/**
 * Integration Tests
 *
 * These tests verify that all components work together correctly in real-world scenarios.
 * These tests use mocked API and TypeEmitter to focus on the integration between
 * TypeGenerator, FileSystemWriter, and Reporter.
 */
describe("Integration Tests", () => {
  let fs: InMemoryFileSystem;
  let fileWriter: FileSystemWriter;
  let reporter: CollectingReporter;
  let logger: SilentLogger;

  // Mock schema that matches a typical app setup
  const mockSchema: ProjectSchema = {
    keys: {
      "common:app.title": { params: [] },
      "common:user.greeting": {
        params: [
          { name: "firstName", type: "string" },
          { name: "lastName", type: "string" },
        ],
      },
      "common:cart.items": {
        params: [{ name: "count", type: "number" }],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    fs = new InMemoryFileSystem();
    fileWriter = new FileSystemWriter(fs);
    reporter = new CollectingReporter();
    logger = new SilentLogger();

    // Setup ApiClient mocks
    const mockApiClient = vi.mocked(ApiClient);
    mockApiClient.prototype.validateConnection = vi.fn().mockResolvedValue(true);
    mockApiClient.prototype.fetchSchema = vi.fn().mockResolvedValue(mockSchema);
  });

  describe("End-to-End Type Generation Pipeline", () => {
    it("should generate types from API to file system", async () => {
      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      // Verify successful generation
      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(3); // 3 keys in mockSchema
      expect(result.filePath).toBe("src/types/i18n.d.ts");

      // Verify file was written
      expect(fs.hasFile("src/types/i18n.d.ts")).toBe(true);

      // Verify file content
      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("declare module '@comvi/core'");
      expect(content).toContain("'common:app.title'");
      expect(content).toContain("'common:user.greeting'");
      expect(content).toContain("'common:cart.items'");

      // Verify reporter received events
      const reports = reporter.reports;
      expect(reports).toContainEqual(
        expect.objectContaining({
          type: "start",
        }),
      );
      expect(reports).toContainEqual(
        expect.objectContaining({
          type: "success",
        }),
      );
    });

    it("should handle API connection failure gracefully", async () => {
      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.validateConnection = vi.fn().mockResolvedValue(false);

      const options: GeneratorOptions = {
        apiKey: "invalid-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const isValid = await generator.validateConnection();

      expect(isValid).toBe(false);
    });

    it("should handle API fetch errors", async () => {
      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network timeout");

      // Verify error was reported
      const errorReport = reporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
    });

    it("should handle file write errors", async () => {
      // Make file system throw on write
      vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("Permission denied"));

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });
  });

  describe("Multi-Namespace Scenarios", () => {
    it("should generate types for multiple namespaces", async () => {
      // Mock schema with multiple namespace keys
      const multiNsSchema: ProjectSchema = {
        keys: {
          "common:hello": { params: [] },
          "common:goodbye": { params: [] },
          "auth:login": { params: [] },
          "auth:logout": { params: [] },
        },
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(multiNsSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(4);

      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("'common:hello'");
      expect(content).toContain("'common:goodbye'");
      expect(content).toContain("'auth:login'");
      expect(content).toContain("'auth:logout'");
    });
  });

  describe("Parameter Type Detection Integration", () => {
    it("should correctly detect and generate types for complex parameters", async () => {
      const complexSchema: ProjectSchema = {
        keys: {
          "complex:items": {
            params: [{ name: "count", type: "number" }],
          },
          "complex:greeting": {
            params: [
              { name: "firstName", type: "string" },
              { name: "lastName", type: "string" },
              { name: "count", type: "number" },
            ],
          },
          "complex:stats": {
            params: [
              { name: "total", type: "number" },
              { name: "itemIndex", type: "number" },
            ],
          },
          "complex:order": {
            params: [
              { name: "orderId", type: "number" },
              { name: "userName", type: "string" },
              { name: "quantity", type: "number" },
            ],
          },
        },
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(complexSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);

      const content = await fs.readFile("src/types/i18n.d.ts");

      // Verify all keys are present
      expect(content).toContain("'complex:items'");
      expect(content).toContain("'complex:greeting'");
      expect(content).toContain("'complex:stats'");
      expect(content).toContain("'complex:order'");
    });
  });

  describe("Error Recovery and Resilience", () => {
    it("should succeed on retry after previous failure", async () => {
      let callCount = 0;
      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Transient network error");
        }
        return Promise.resolve(mockSchema);
      });

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      // First attempt - should fail
      const result1 = await generator.generate();
      expect(result1.success).toBe(false);

      // Second attempt - should succeed
      const result2 = await generator.generate();
      expect(result2.success).toBe(true);
    });

    it("should provide detailed error information for debugging", async () => {
      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi
        .fn()
        .mockRejectedValue(new Error("API returned 429: Rate limit exceeded"));

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Rate limit exceeded");
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify error was reported with context
      const errorReport = reporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
    });
  });

  describe("Real-World User Scenarios", () => {
    it("should handle typical React app setup", async () => {
      const reactSchema: ProjectSchema = {
        keys: {
          "common:app.title": { params: [] },
          "common:nav.home": { params: [] },
          "common:nav.about": { params: [] },
          "auth:login.title": { params: [] },
          "auth:login.email": { params: [] },
          "auth:login.password": { params: [] },
          "auth:login.submit": { params: [] },
          "auth:login.error": {
            params: [{ name: "email", type: "string" }],
          },
        },
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(reactSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(8);

      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("declare module '@comvi/core'");
      expect(content).toContain("'auth:login.error'");
    });

    it("should handle typical Vue app setup", async () => {
      const vueSchema: ProjectSchema = {
        keys: {
          "common:welcome": {
            params: [{ name: "appName", type: "string" }],
          },
          "common:loading": { params: [] },
        },
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(vueSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);

      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("declare module '@comvi/core'");
      expect(content).toContain("'common:welcome'");
      expect(content).toContain("'common:loading'");
    });

    it("should handle e-commerce app with complex parameters", async () => {
      const ecommerceSchema: ProjectSchema = {
        keys: {
          "shop:product.price": {
            params: [{ name: "price", type: "number" }],
          },
          "shop:cart.items": {
            params: [{ name: "count", type: "number" }],
          },
          "shop:cart.total": {
            params: [
              { name: "total", type: "number" },
              { name: "itemCount", type: "number" },
            ],
          },
          "shop:shipping.estimate": {
            params: [{ name: "numDays", type: "number" }],
          },
        },
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(ecommerceSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.success).toBe(true);

      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("'shop:product.price'");
      expect(content).toContain("'shop:cart.items'");
      expect(content).toContain("'shop:cart.total'");
      expect(content).toContain("'shop:shipping.estimate'");
    });
  });

  describe("Performance and Metrics", () => {
    it("should track generation metrics", async () => {
      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const result = await generator.generate();

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.keysGenerated).toBe(3);
      expect(result.filePath).toBe("src/types/i18n.d.ts");

      // Verify metrics were reported
      const completeReport = reporter.reports.find((r) => r.type === "success");
      expect(completeReport?.data).toMatchObject({
        keysGenerated: 3,
        duration: expect.any(Number),
      });
    });

    it("should handle large datasets efficiently", async () => {
      // Create schema with 1000 keys
      const largeSchema: ProjectSchema = {
        keys: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [
            `large:key${i}`,
            {
              params: [{ name: `param${i}`, type: "string" as const }],
            },
          ]),
        ),
      };

      const mockApi = vi.mocked(ApiClient);
      mockApi.prototype.fetchSchema = vi.fn().mockResolvedValue(largeSchema);

      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      const startTime = Date.now();
      const result = await generator.generate();
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(1000);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify file was generated correctly
      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("'large:key0'");
      expect(content).toContain("'large:key999'");
    });
  });

  describe("SSE Integration", () => {
    it("should generate from pre-fetched schema", async () => {
      const options: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
      };

      const generator = new TypeGenerator(options, {
        writer: fileWriter,
        reporter,
        logger,
      });

      // Simulate SSE update - generate from already-fetched schema
      const sseSchema: ProjectSchema = {
        keys: {
          "sse:update1": { params: [] },
          "sse:update2": { params: [{ name: "value", type: "string" }] },
        },
      };

      const result = await generator.generateFromSchema(sseSchema);

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(2);

      // Verify the file was written with the real TypeEmitter output
      const content = await fs.readFile("src/types/i18n.d.ts");
      expect(content).toContain("'sse:update1'");
      expect(content).toContain("'sse:update2'");
    });
  });
});
