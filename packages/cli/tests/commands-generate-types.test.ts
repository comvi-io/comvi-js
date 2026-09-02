import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as nodeFs } from "fs";
import { dirname, join } from "path";
import {
  createGenerateTypesCommand,
  createTypegenCommand,
  createGenerateCommand,
} from "../src/commands/generate-types";
import type { ProjectSchema } from "../src/types";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  makeTempDir,
  mockEventSource,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type FakeEventSource,
  type Routes,
} from "./helpers";

/**
 * The command runs end to end: a real `.comvirc.json`, a real TypeGenerator and
 * a real declaration file on disk. Only `fetch` — and `eventsource` for watch
 * mode — are replaced.
 */

const PROJECT_ID = 42;

const schema: ProjectSchema = {
  keys: {
    "common:welcome": { params: [] },
    "common:greeting": { params: [{ name: "name", type: "string" }] },
  },
};

const PATHS = {
  project: "/v1/project",
  namespaces: `/v1/projects/${PROJECT_ID}/namespaces`,
  schema: `/v1/projects/${PROJECT_ID}/schema`,
} as const;

/** Answers the project lookup, the default-namespace lookup and the schema fetch. */
const SCHEMA_ROUTES: Routes = {
  [PATHS.project]: { body: { id: PROJECT_ID, name: "Acme" } },
  [PATHS.namespaces]: { body: [{ namespace: "default", isDefault: true }] },
  [PATHS.schema]: { body: schema },
};

const REJECTED_SCHEMA_ROUTES: Routes = {
  ...SCHEMA_ROUTES,
  [PATHS.schema]: { status: 401, statusText: "Unauthorized" },
};

describe("comvi generate-types", () => {
  let configPath: string;
  let outputPath: string;
  let output: ConsoleCapture;

  beforeEach(async () => {
    const dir = await makeTempDir("comvi-typegen");
    configPath = join(dir, ".comvirc.json");
    outputPath = join(dir, "types", "i18n.d.ts");

    await nodeFs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "test-key", apiBaseUrl: "https://api.test.com", outputPath }),
    );

    vi.stubEnv("COMVI_API_KEY", undefined);
    vi.stubEnv("COMVI_API_BASE_URL", undefined);
    vi.stubEnv("COMVI_LOG_LEVEL", undefined);

    output = captureConsole();
    stubProcessExit();
    stubFetch(SCHEMA_ROUTES);
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it.each([
    ["generate-types", createGenerateTypesCommand],
    ["typegen", createTypegenCommand],
    ["generate", createGenerateCommand],
  ])("`comvi %s` writes the declaration file and exits 0", async (_name, createCommand) => {
    await expect(
      createCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    const written = await nodeFs.readFile(outputPath, "utf-8");
    expect(written).toContain("declare module '@comvi/core'");
    expect(written).toContain("'common:welcome': never;");
    expect(written).toContain("'common:greeting': { name: string };");
  });

  it("reports the number of keys and the file it wrote", async () => {
    await expect(
      createGenerateTypesCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    expect(output.stdout).toContain(`✓ Generated 2 keys → ${outputPath}`);
  });

  it("exits 1 when the schema request is rejected", async () => {
    stubFetch(REJECTED_SCHEMA_ROUTES);

    await expect(
      createGenerateTypesCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 1 });

    expect(output.stderr).toContain("✗ Generation failed: Invalid API key");
  });

  it("exits 1 when the config file named by -c does not exist", async () => {
    const missing = join(dirname(configPath), "absent.json");

    await expect(
      createGenerateTypesCommand().parseAsync(["-c", missing], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 1 });

    expect(output.stderr).toContain(`✗ Error: Config file not found: ${missing}`);
  });

  it("the typegen alias accepts the same flags as generate-types", () => {
    expect(createTypegenCommand().options.map((option) => option.flags)).toEqual(
      createGenerateTypesCommand().options.map((option) => option.flags),
    );
  });

  it("the legacy generate alias accepts --config only", () => {
    expect(createGenerateCommand().options.map((option) => option.long)).toEqual(["--config"]);
  });

  describe("--check", () => {
    it("exits 0 when it checks the file a preceding generate wrote", async () => {
      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 0 });

      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 0 });

      expect(output.stdout).toContain("✓ Types are up to date (2 keys)");
    });

    it("exits 1 and counts no current keys when the file has never been generated", async () => {
      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stderr).toContain("✗ Types are outdated!");
      expect(output.stderr).toContain("Current: 0 keys");
      expect(output.stderr).toContain("Expected: 2 keys");
    });

    it("exits 1 and contrasts the key counts when the file is stale", async () => {
      await nodeFs.mkdir(dirname(outputPath), { recursive: true });
      await nodeFs.writeFile(outputPath, "  interface TranslationKeys {\n    'x': never;\n  }\n");

      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stderr).toContain("Current: 1 keys");
      expect(output.stderr).toContain("Expected: 2 keys");
    });

    it("exits 2 when the schema request fails, so CI can tell a blip from stale types", async () => {
      stubFetch(REJECTED_SCHEMA_ROUTES);

      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 2 });

      expect(output.stderr).toContain("✗ Check could not run: Invalid API key");
      expect(output.stderr).not.toContain("Types are outdated");
    });

    it("exits 4 when the config fails validation", async () => {
      const invalidConfigPath = join(dirname(configPath), "invalid.comvirc.json");
      await nodeFs.writeFile(
        invalidConfigPath,
        JSON.stringify({ apiKey: "test-key", apiBaseUrl: "https://api.test.com", locales: [] }),
      );

      await expect(
        createGenerateTypesCommand().parseAsync(["-c", invalidConfigPath, "--check"], {
          from: "user",
        }),
      ).rejects.toMatchObject({ exitCode: 4 });

      expect(output.stderr).toContain('"locales" is an empty list');
    });
  });

  describe("--watch", () => {
    afterEach(() => {
      vi.doUnmock("eventsource");
      vi.resetModules();
    });

    async function startWatch(): Promise<{ stream: FakeEventSource; interrupt: () => void }> {
      const { instances } = mockEventSource();
      const listenersOn = process.on.bind(process);
      let interrupt: (() => void) | undefined;

      vi.spyOn(process, "on").mockImplementation(((event: string, listener: () => void) => {
        if (event === "SIGINT") {
          interrupt = listener;
          return process;
        }
        return listenersOn(event as "exit", listener);
      }) as never);
      vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);

      const { createGenerateTypesCommand: createCommand } =
        await import("../src/commands/generate-types");
      await createCommand().parseAsync(["-c", configPath, "--watch"], { from: "user" });

      if (!instances[0]) {
        throw new Error("watch mode did not open an SSE connection");
      }
      if (!interrupt) {
        throw new Error("watch mode did not register a SIGINT handler");
      }

      return { stream: instances[0], interrupt };
    }

    it("rewrites the declaration file when the stream pushes a new schema", async () => {
      const { stream } = await startWatch();
      const updated: ProjectSchema = {
        keys: { ...schema.keys, "common:farewell": { params: [] } },
      };

      stream.onmessage?.({ data: JSON.stringify(updated) } as MessageEvent);

      await vi.waitFor(async () => {
        expect(await nodeFs.readFile(outputPath, "utf-8")).toContain("'common:farewell': never;");
      });
    });

    it("closes the stream and exits 0 on SIGINT", async () => {
      const { stream, interrupt } = await startWatch();
      const close = vi.spyOn(stream, "close");

      await expect(async () => interrupt()).rejects.toMatchObject({ exitCode: 0 });

      expect(close).toHaveBeenCalledOnce();
      expect(output.stdout).toContain("✓ Stopped watching");
    });

    it("exits 1 without subscribing when the initial generation fails", async () => {
      stubFetch(REJECTED_SCHEMA_ROUTES);

      await expect(
        createGenerateTypesCommand().parseAsync(["-c", configPath, "--watch"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stderr).toContain("✗ Initial generation failed: Invalid API key");
    });
  });
});
