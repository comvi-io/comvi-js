import { describe, it, expect, beforeEach, vi } from "vitest";
import { TypeGenerator } from "../src/core/TypeGenerator";
import { ApiClient } from "../src/core/ApiClient";
import { InMemoryFileSystem, FileSystemWriter } from "../src/core/FileSystemWriter";
import { CollectingReporter } from "../src/core/GenerationReporter";
import { SilentLogger } from "../src/utils/logger";
import type { GeneratorOptions, ProjectSchema } from "../src/types";

// Only ApiClient is mocked; TypeEmitter and FileSystemWriter run for real.
vi.mock("../src/core/ApiClient");

const options: GeneratorOptions = {
  apiKey: "test-key",
  apiBaseUrl: "https://api.test.com",
  outputPath: "src/types/i18n.d.ts",
  strictParams: true,
};

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

describe("TypeGenerator over the real TypeEmitter and an in-memory filesystem", () => {
  let fs: InMemoryFileSystem;
  let reporter: CollectingReporter;
  let generator: TypeGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    fs = new InMemoryFileSystem();
    reporter = new CollectingReporter();

    vi.mocked(ApiClient.prototype.validateConnection).mockResolvedValue(true);
    vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValue(mockSchema);
    vi.mocked(ApiClient.prototype.fetchDefaultNamespace).mockResolvedValue("default");

    generator = new TypeGenerator(options, {
      writer: new FileSystemWriter(fs),
      reporter,
      logger: new SilentLogger(),
    });
  });

  it("should generate types from API to file system", async () => {
    const result = await generator.generate();

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(3);
    expect(result.filePath).toBe("src/types/i18n.d.ts");
    expect(fs.hasFile("src/types/i18n.d.ts")).toBe(true);

    const content = await fs.readFile("src/types/i18n.d.ts");
    expect(content).toContain("declare module '@comvi/core'");
    expect(content).toContain("'common:app.title': never;");
    expect(content).toContain("'common:cart.items': { count: number };");
    expect(content).toContain("'common:user.greeting': { firstName: string; lastName: string };");

    expect(reporter.reports.map((r) => r.type)).toEqual([
      "start",
      "fetching",
      "generating",
      "success",
    ]);
  });

  it.each<{ shape: string; schema: ProjectSchema; expected: string[] }>([
    {
      shape: "multi-namespace",
      schema: {
        keys: {
          "common:hello": { params: [] },
          "common:goodbye": { params: [] },
          "auth:login": { params: [] },
          "auth:logout": { params: [] },
        },
      } satisfies ProjectSchema,
      expected: [
        "'auth:login': never;",
        "'auth:logout': never;",
        "'common:goodbye': never;",
        "'common:hello': never;",
      ],
    },
    {
      shape: "multi-parameter",
      schema: {
        keys: {
          "shop:cart.total": {
            params: [
              { name: "total", type: "number" },
              { name: "itemCount", type: "number" },
            ],
          },
          "shop:product.price": { params: [{ name: "price", type: "number" }] },
          "auth:login.error": { params: [{ name: "email", type: "string" }] },
        },
      } satisfies ProjectSchema,
      expected: [
        "'auth:login.error': { email: string };",
        "'shop:cart.total': { total: number; itemCount: number };",
        "'shop:product.price': { price: number };",
      ],
    },
  ])("emits every key of a $shape schema, and nothing else", async ({ schema, expected }) => {
    vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce(schema);

    const result = await generator.generate();

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(expected.length);

    const content = await fs.readFile("src/types/i18n.d.ts");
    const keyLines = (content.match(/^ {4}'.*$/gm) ?? []).map((line) => line.trim());
    expect(keyLines).toEqual(expected);
  });

  it("should succeed on retry after previous failure", async () => {
    vi.mocked(ApiClient.prototype.fetchSchema)
      .mockRejectedValueOnce(new Error("Transient network error"))
      .mockResolvedValue(mockSchema);

    const failed = await generator.generate();
    const retried = await generator.generate();

    expect(failed.success).toBe(false);
    expect(retried.success).toBe(true);
  });

  it("emits every key of a 1000-key schema", async () => {
    vi.mocked(ApiClient.prototype.fetchSchema).mockResolvedValueOnce({
      keys: Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [
          `large:key${i}`,
          { params: [{ name: `param${i}`, type: "string" as const }] },
        ]),
      ),
    });

    const result = await generator.generate();

    expect(result.success).toBe(true);
    expect(result.keysGenerated).toBe(1000);

    const content = await fs.readFile("src/types/i18n.d.ts");
    expect(content.match(/^ {4}'large:key\d+':/gm)).toHaveLength(1000);
    expect(content).toContain("'large:key0': { param0: string };");
    expect(content).toContain("'large:key999': { param999: string };");
  });
});
