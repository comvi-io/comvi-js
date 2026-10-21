import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createInitCommand } from "../src/commands/init";
import { createTypegenCommand } from "../src/commands/generate-types";
import { ConsoleReporter } from "../src/core/GenerationReporter";
import { TranslationSync } from "../src/core/TranslationSync";
import { ErrorCodes, wrapError } from "../src/utils/errors";
import type { Logger } from "../src/utils/logger";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  ExitSignal,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  thrownBy,
  type ConsoleCapture,
} from "./helpers";

let root: string;
let output: ConsoleCapture;

beforeEach(async () => {
  root = await fs.realpath(await makeTempDir("comvi-small-fixes"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.stubEnv("COMVI_API_KEY", undefined);
  vi.stubEnv("COMVI_API_BASE_URL", undefined);
  output = captureConsole();
  stubProcessExit();
});

afterEach(async () => {
  await removeTempDirs();
  assertNoUnexpectedRequests();
});

async function run(args: string[], create = createTypegenCommand): Promise<void> {
  try {
    await create().parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error;
  }
}

describe("network errors name their cause", () => {
  it("keeps the code and address that fetch hides behind 'fetch failed'", () => {
    const failure = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
        code: "ECONNREFUSED",
      }),
    });

    expect(wrapError(failure, "Failed to fetch translations", "X").message).toBe(
      "Failed to fetch translations: fetch failed (connect ECONNREFUSED 127.0.0.1:9)",
    );
  });
});

describe("the typegen reporter", () => {
  it("says it fetches the schema, not translations", () => {
    const info = vi.fn();
    new ConsoleReporter({ info } as unknown as Logger).reportFetching();
    expect(info).toHaveBeenCalledWith("Fetching schema from TMS...");
  });

  it("prints a failed generation once", async () => {
    await fs.writeFile(
      join(root, ".comvirc.json"),
      JSON.stringify({ apiKey: "k", apiBaseUrl: "https://api.test.com" }),
    );
    stubFetch({ "/v1/project": { status: 401, statusText: "Unauthorized" } });

    await run([]);

    const lines = output.stderr.split("\n").filter((line) => line.includes("Invalid API key"));
    expect(lines).toHaveLength(1);
  });
});

describe("typegen --check", () => {
  it("does not call an output it cannot read 'outdated'", async () => {
    const outputPath = join(root, "types", "i18n.d.ts");
    await fs.mkdir(outputPath, { recursive: true }); // a directory where the file should be
    await fs.writeFile(
      join(root, ".comvirc.json"),
      JSON.stringify({ apiKey: "k", apiBaseUrl: "https://api.test.com", outputPath }),
    );
    await fs.writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { "@comvi/core": "*" } }),
    );
    stubFetch({
      "/v1/project": { body: { id: 1, name: "Acme" } },
      "/v1/projects/1/namespaces": { body: [{ namespace: "default", isDefault: true }] },
      "/v1/projects/1/schema": { body: { keys: {} } },
    });

    await run(["--check"]);

    expect(output.stderr).not.toContain("outdated");
    expect(output.stderr).toContain("Failed to read");
  });
});

describe("init", () => {
  it("validates against and writes COMVI_API_BASE_URL when --api-url is not given", async () => {
    vi.stubEnv("COMVI_API_KEY", "k");
    vi.stubEnv("COMVI_API_BASE_URL", "https://staging.test.com");
    const http = stubFetch({ "/v1/project": { body: { id: 1, name: "Staging" } } });

    await run([], createInitCommand);

    expect(http.urlFor("/v1/project")).toBe("https://staging.test.com/v1/project");
    const written = JSON.parse(await fs.readFile(join(root, ".comvirc.json"), "utf-8"));
    expect(written.apiBaseUrl).toBe("https://staging.test.com");
  });
});

describe("two catalogs that resolve to one file", () => {
  it("are refused before anything is written", async () => {
    const dir = join(root, "locales");
    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: "{languageTag}-{namespace}.json",
      format: "json",
    });
    const response = {
      locales: ["en", "en-US"],
      namespaces: ["US-shop", "shop"],
      translations: { en: { "US-shop": { a: "1" } }, "en-US": { shop: { a: "2" } } },
    };

    const error = await sync.writeTranslations(response).catch((e: unknown) => e);

    expect(
      thrownBy(() => {
        throw error;
      }).code,
    ).toBe(ErrorCodes.VALIDATION_FAILED);
    expect((error as Error).message).toContain("en-US-shop.json");
    await expect(fs.access(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
