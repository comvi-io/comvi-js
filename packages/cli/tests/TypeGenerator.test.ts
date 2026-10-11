import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ApiClient } from "../src/core/ApiClient";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger, type Logger } from "../src/utils/logger";
import type { GeneratorOptions, ProjectSchema } from "../src/types";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      // Named explicitly so these tests do not depend on what the directory
      // vitest happens to run in declares. The block that exercises the
      // manifest rule builds its own generator without it.
      augment: "@comvi/core",
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
        augment: "@comvi/core",
      };

      const gen = new TypeGenerator(minimalOptions, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await gen.generate();

      const written = mockFileSystem.getFile("types/i18n.d.ts");
      expect(written).toContain('"name": string');
      expect(written).not.toContain('"name"?: string');
    });

    it("should apply strictParams=false when explicitly provided", async () => {
      const customOptions: GeneratorOptions = {
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "types/i18n.d.ts",
        strictParams: false,
        augment: "@comvi/core",
      };

      const gen = new TypeGenerator(customOptions, {
        writer: mockWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await gen.generate();

      expect(mockFileSystem.getFile("types/i18n.d.ts")).toContain('"name"?: string');
    });
  });

  describe("logging", () => {
    it("logs connection validation failures through the injected logger", async () => {
      const logger: Logger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        setLevel: vi.fn(),
      };
      const gen = new TypeGenerator(mockOptions, {
        writer: mockWriter,
        reporter: mockReporter,
        logger,
      });
      const failure = new Error("Network unreachable");
      vi.mocked(ApiClient.prototype.validateConnection).mockRejectedValueOnce(failure);

      await gen.validateConnection();

      expect(logger.error).toHaveBeenCalledWith("Connection validation failed", failure);
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
      expect(written).toContain('"common:welcome": never;');
      expect(written).toContain('"common:greeting": { "name": string };');
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
      expect(written).toContain('"welcome": never;');
      expect(written).toContain('"greeting": { "name": string };');
      expect(written).not.toContain('"common:welcome": never;');
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
      expect(written).toContain('"common:welcome": never;');
      expect(written).toContain('"dashboard:title": never;');
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
      expect(written).toContain('"name": string');
      expect(written).toContain('"count": number');
    });

    it("should measure the elapsed time when the fetch fails", async () => {
      vi.useFakeTimers();
      vi.mocked(ApiClient.prototype.fetchSchema).mockImplementationOnce(async () => {
        vi.advanceTimersByTime(10);
        throw new Error("Network error");
      });

      const result = await generator.generate();

      expect(result.success).toBe(false);
      expect(result.duration).toBe(10);
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

  describe("the module the declarations augment", () => {
    const tempDirs: string[] = [];
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    /** A project directory whose manifest declares `dependencies`. */
    function project(dependencies: Record<string, string>): string {
      const dir = mkdtempSync(join(tmpdir(), "comvi-generator-augment-"));
      tempDirs.push(dir);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", dependencies }));
      return dir;
    }

    /** A generator with no configured `augment`, so the manifest decides. */
    function generatorForManifest(augment?: string): TypeGenerator {
      return new TypeGenerator(
        { ...mockOptions, augment },
        { writer: mockWriter, reporter: mockReporter, logger: mockLogger },
      );
    }

    it("augments the binding the project declares, with no core dependency", async () => {
      // The documented install is one package, and core arrives through it.
      // Augmenting what the app declares is the only specifier it can resolve.
      process.chdir(project({ "@comvi/react": "^0.5.0" }));

      const result = await generatorForManifest().generate();

      expect(result.success).toBe(true);
      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain(
        "declare module '@comvi/react' {",
      );
    });

    it("prefers @comvi/core when the project declares it too", async () => {
      process.chdir(project({ "@comvi/react": "^0.5.0", "@comvi/core": "^0.5.0" }));

      await generatorForManifest().generate();

      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain(
        "declare module '@comvi/core' {",
      );
    });

    it("takes the configured augment module over the manifest", async () => {
      process.chdir(project({ "@comvi/react": "^0.5.0" }));
      await generatorForManifest("@acme/i18n").generate();

      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain(
        "declare module '@acme/i18n' {",
      );
    });

    it("writes nothing for a project that declares no Comvi module", async () => {
      process.chdir(project({ react: "^19.0.0" }));

      const result = await generatorForManifest().generate();

      expect(result.success).toBe(false);
      expect(result.error).toContain("@comvi/react");
      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toBeUndefined();
    });

    it("checks against the same target it would write, so a check reports no drift", async () => {
      // The target comes from the manifest, so every machine picks the same
      // one. That is what lets the verify path regenerate the write path's
      // file instead of needing a carve-out.
      process.chdir(project({ "@comvi/nuxt": "^0.5.0" }));
      const manifestGenerator = generatorForManifest();
      await manifestGenerator.generate();

      await expect(manifestGenerator.check()).resolves.toMatchObject({ upToDate: true });
      expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain(
        "declare module '@comvi/nuxt' {",
      );
    });

    it("reports drift once the project switches to another Comvi package", async () => {
      process.chdir(project({ "@comvi/vue": "^0.5.0" }));
      const manifestGenerator = generatorForManifest();
      await manifestGenerator.generate();
      process.chdir(project({ "@comvi/svelte": "^0.5.0" }));

      await expect(manifestGenerator.check()).resolves.toMatchObject({ upToDate: false });
    });

    it("refuses to check a project that declares no Comvi module", async () => {
      // No carve-out: the write path and the verify path ask the manifest the
      // same question, so neither can pass where the other fails.
      process.chdir(project({ react: "^19.0.0" }));

      await expect(generatorForManifest().check()).rejects.toThrow("@comvi/react");
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

    it("reports a file written by @comvi/cli 0.4 as up to date", async () => {
      // 0.4 stamped a `Generated at:` line under the tool header and 0.5 emits
      // none. Without normalizing the WHOLE line away, every repo would look
      // stale the first time it ran the new CLI.
      await generator.generate();
      const lines = mockFileSystem.getFile("src/types/i18n.d.ts")!.split("\n");
      lines.splice(3, 0, " * Generated at: 1999-01-01T00:00:00.000Z");
      await mockFileSystem.writeFile("src/types/i18n.d.ts", lines.join("\n"));

      await expect(generator.check()).resolves.toMatchObject({ upToDate: true });
    });

    it("reports a file written by @comvi/vite-plugin as up to date", async () => {
      // Vite-in-dev, CLI-check-in-CI is a supported workflow. The two tools
      // used to stamp their own name on header line 3, so the check reported
      // drift that regenerating could never resolve.
      await generator.generate();
      const lines = mockFileSystem.getFile("src/types/i18n.d.ts")!.split("\n");
      lines[2] = " * DO NOT EDIT — regenerated by @comvi/vite-plugin on every file change";
      await mockFileSystem.writeFile("src/types/i18n.d.ts", lines.join("\n"));

      await expect(generator.check()).resolves.toMatchObject({ upToDate: true });
    });

    it("reports drift when the file on disk is missing a key", async () => {
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        [
          "declare module '@comvi/core' {",
          "  interface TranslationKeys {",
          '    "common:welcome": never;',
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

    it("counts an empty key", async () => {
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        [
          "declare module '@comvi/core' {",
          "  interface TranslationKeys {",
          '    "": never;',
          '    "common:welcome": never;',
          "  }",
          "}",
        ].join("\n"),
      );

      const result = await generator.check();

      expect(result).toEqual({
        upToDate: false,
        keysGenerated: 2,
        currentKeys: 2,
        filePath: "src/types/i18n.d.ts",
      });
    });

    it("counts the keys of a file left by an older, single-quoting CLI", async () => {
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        [
          "declare module '@comvi/core' {",
          "  interface TranslationKeys {",
          "    'common:welcome': never;",
          "    'common:greeting': { name: string };",
          "  }",
          "}",
        ].join("\n"),
      );

      const result = await generator.check();

      expect(result).toEqual({
        upToDate: false,
        keysGenerated: 2,
        currentKeys: 2,
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

    it("compares with the configured strictParams instead of the default", async () => {
      const relaxed = new TypeGenerator(
        { ...mockOptions, strictParams: false },
        { writer: mockWriter, reporter: mockReporter, logger: mockLogger },
      );
      await relaxed.generate();

      const result = await relaxed.check();

      expect(result.upToDate).toBe(true);
    });

    it("reports up to date with zero keys for an empty schema", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValue({ keys: {} });
      await generator.generate();

      const result = await generator.check();

      expect(result).toEqual({
        upToDate: true,
        keysGenerated: 0,
        currentKeys: 0,
        filePath: "src/types/i18n.d.ts",
      });
    });

    it("ignores trailing whitespace when comparing", async () => {
      await generator.generate();
      const current = mockFileSystem.getFile("src/types/i18n.d.ts")!;
      await mockFileSystem.writeFile("src/types/i18n.d.ts", `${current}\n\n`);

      await expect(generator.check()).resolves.toMatchObject({ upToDate: true });
    });

    it("reports drift for a header line that is not the timestamp", async () => {
      // Normalization drops the `Generated at:` line and nothing else. A header
      // edited to anything else is a real difference, and regenerating restores
      // it — quieter than teaching the comparison to ignore arbitrary comments.
      await generator.generate();
      const lines = mockFileSystem.getFile("src/types/i18n.d.ts")!.split("\n");
      lines.splice(3, 0, " * hand-edited note");
      await mockFileSystem.writeFile("src/types/i18n.d.ts", lines.join("\n"));

      await expect(generator.check()).resolves.toMatchObject({ upToDate: false });
    });

    it("only counts whole lines shaped like key declarations", async () => {
      await mockFileSystem.writeFile(
        "src/types/i18n.d.ts",
        "const shape = \"quoted 'fake': entry;\"\n",
      );

      const result = await generator.check();

      expect(result.upToDate).toBe(false);
      expect(result.currentKeys).toBe(0);
    });

    it("wraps a non-Error failure into an Error before propagating", async () => {
      vi.mocked(ApiClient.prototype.fetchSchema).mockRejectedValueOnce("String error");

      const caught = await generator.check().then(
        () => {
          throw new Error("expected check() to reject");
        },
        (error: unknown) => error,
      );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("Unknown error occurred");
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
      expect(written).toContain('"custom:key1": never;');
      expect(written).toContain('"id": number');
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

    it("should report the write failure to the reporter", async () => {
      const failingWriter = new FileSystemWriter({
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockRejectedValue(new Error("Disk full")),
        readFile: vi.fn(),
        access: vi.fn(),
      });
      const gen = new TypeGenerator(mockOptions, {
        writer: failingWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      await gen.generateFromSchema({ keys: {} });

      const errorReport = mockReporter.reports.find((r) => r.type === "error");
      expect(errorReport?.data).toBeInstanceOf(Error);
      expect((errorReport?.data as Error).message).toContain("Disk full");
    });

    it("should measure the elapsed time when the write fails", async () => {
      vi.useFakeTimers();
      const failingWriter = new FileSystemWriter({
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(10);
          throw new Error("Disk full");
        }),
        readFile: vi.fn(),
        access: vi.fn(),
      });
      const gen = new TypeGenerator(mockOptions, {
        writer: failingWriter,
        reporter: mockReporter,
        logger: mockLogger,
      });

      const result = await gen.generateFromSchema({ keys: {} });

      expect(result.success).toBe(false);
      expect(result.duration).toBe(10);
    });

    it("should fall back to a generic message when the failure is not an Error", async () => {
      vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockRejectedValueOnce("nope");

      const result = await generator.generateFromSchema({ keys: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should generate types for an empty schema", async () => {
      const schema: ProjectSchema = { keys: {} };

      const result = await generator.generateFromSchema(schema);

      expect(result.success).toBe(true);
      expect(result.keysGenerated).toBe(0);
    });
  });
});
