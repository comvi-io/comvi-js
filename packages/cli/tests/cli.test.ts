import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger } from "../src/utils/logger";
import type { ProjectSchema, GeneratorOptions } from "../src/types";
import { promises as nodeFs } from "fs";
import { join } from "path";
import { makeTempDir, removeTempDirs } from "./helpers";

/**
 * TypeGenerator runs for real here: only `fetch` is mocked, and the seams are
 * filled with test doubles (InMemoryFileSystem, CollectingReporter,
 * SilentLogger) rather than by mocking ConfigLoader or TypeGenerator.
 */

const mockSchema: ProjectSchema = {
  keys: {
    "common:welcome": { params: [] },
    "common:greeting": {
      params: [{ name: "name", type: "string" }],
    },
  },
};

/** Enough for the retry ladder: 500 ms + 1000 ms of backoff between 3 attempts. */
const RETRY_LADDER_MS = 2000;

describe("ConfigLoader.create() on the real filesystem", () => {
  afterEach(removeTempDirs);

  it("should create config file with provided options via ConfigLoader.create", async () => {
    const outputPath = join(await makeTempDir("comvi-cli-create"), ".comvirc.json");

    const filePath = await ConfigLoader.create(
      {
        apiKey: "test-key",
        apiBaseUrl: "https://api.custom.com",
        outputPath: "custom/types/i18n.d.ts",
        strictParams: false,
      },
      outputPath,
    );

    expect(filePath).toBe(outputPath);
    expect(JSON.parse(await nodeFs.readFile(outputPath, "utf-8"))).toMatchObject({
      apiKey: "test-key",
      apiBaseUrl: "https://api.custom.com",
      outputPath: "custom/types/i18n.d.ts",
      strictParams: false,
    });
  });

  it("should merge default values for missing config options", async () => {
    const outputPath = join(await makeTempDir("comvi-cli-defaults"), ".comvirc.json");

    const filePath = await ConfigLoader.create({}, outputPath);

    expect(filePath).toBe(outputPath);
    const parsed = JSON.parse(await nodeFs.readFile(outputPath, "utf-8"));
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.apiBaseUrl).toBe("https://api.comvi.io");
    expect(parsed.outputPath).toBe("src/types/i18n.d.ts");
    expect(parsed.strictParams).toBe(true);
  });
});

describe("TypeGenerator.generate() over a mocked fetch", () => {
  let mockFileSystem: InMemoryFileSystem;
  let mockReporter: CollectingReporter;
  let fetchMock: MockedFunction<typeof fetch>;

  const options: GeneratorOptions = {
    apiKey: "test-key",
    apiBaseUrl: "https://api.test.com",
    outputPath: "src/types/i18n.d.ts",
    strictParams: true,
  };

  function makeGenerator(overrides: Partial<GeneratorOptions> = {}): TypeGenerator {
    const generator = new TypeGenerator(
      { ...options, ...overrides },
      {
        writer: new FileSystemWriter(mockFileSystem),
        reporter: mockReporter,
        logger: new SilentLogger(),
      },
    );
    vi.spyOn(generator.getApiClient(), "fetchDefaultNamespace").mockResolvedValue("default");
    return generator;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockFileSystem = new InMemoryFileSystem();
    mockReporter = new CollectingReporter();
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate types successfully and write to file", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => mockSchema } as Response);

    const result = await makeGenerator().generate();

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(2);
    expect(result.filePath).toBe("src/types/i18n.d.ts");

    const written = mockFileSystem.getFile("src/types/i18n.d.ts");
    expect(written).toContain("declare module '@comvi/core'");
    expect(written).toContain("interface TranslationKeys");
  });

  it("should generate an empty declaration file when no keys are found in schema", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: {} }) } as Response);

    const result = await makeGenerator().generate();

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(0);
  });

  it("should return failure result when API returns an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    const promise = makeGenerator().generate();
    await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("should respect strictParams=false and produce optional params", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => mockSchema } as Response);

    const result = await makeGenerator({ strictParams: false }).generate();

    expect(result.success).toBe(true);
    expect(mockFileSystem.getFile("src/types/i18n.d.ts")).toContain("name?: string");
  });

  it("should handle network errors gracefully with failure result", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const promise = makeGenerator().generate();
    await vi.advanceTimersByTimeAsync(RETRY_LADDER_MS);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
    expect(mockReporter.reports.find((r) => r.type === "error")?.data).toBeInstanceOf(Error);
  });

  it("should report all progress events during successful generation", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => mockSchema } as Response);

    await makeGenerator().generate();

    expect(mockReporter.reports.map((r) => r.type)).toEqual([
      "start",
      "fetching",
      "generating",
      "success",
    ]);
  });

  it("should regenerate types from schema update via generateFromSchema", async () => {
    const updatedSchema: ProjectSchema = {
      keys: {
        ...mockSchema.keys,
        "common:new_key": { params: [{ name: "count", type: "number" }] },
      },
    };

    const result = await makeGenerator().generateFromSchema(updatedSchema);

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(3);

    const written = mockFileSystem.getFile("src/types/i18n.d.ts");
    expect(written).toContain("'common:new_key'");
    expect(written).toContain("count: number");
  });
});
