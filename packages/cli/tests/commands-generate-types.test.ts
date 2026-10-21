import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as nodeFs } from "fs";
import { dirname, join } from "path";
import { createTypegenCommand } from "../src/commands/generate-types";
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

describe("comvi typegen", () => {
  let configPath: string;
  let outputPath: string;
  let projectDir: string;
  let originalCwd: string;
  let output: ConsoleCapture;

  beforeEach(async () => {
    const dir = await makeTempDir("comvi-typegen");
    projectDir = dir;
    configPath = join(dir, ".comvirc.json");
    outputPath = join(dir, "types", "i18n.d.ts");

    await nodeFs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "test-key", apiBaseUrl: "https://api.test.com", outputPath }),
    );

    // A real app manifest: the generated declarations augment the Comvi package
    // the project declares, and the command reads that from the directory it
    // runs in. Nothing here installs anything — declaring is the whole rule.
    await nodeFs.writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "app", dependencies: { "@comvi/react": "^0.5.0" } }),
    );
    originalCwd = process.cwd();
    process.chdir(dir);

    vi.stubEnv("COMVI_API_KEY", undefined);
    vi.stubEnv("COMVI_API_BASE_URL", undefined);
    vi.stubEnv("COMVI_LOG_LEVEL", undefined);

    output = captureConsole();
    stubProcessExit();
    stubFetch(SCHEMA_ROUTES);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it("`comvi typegen` writes the declaration file and exits 0", async () => {
    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    const written = await nodeFs.readFile(outputPath, "utf-8");
    expect(written).toContain("declare module '@comvi/react'");
    expect(written).toContain('"common:welcome": never;');
    expect(written).toContain('"common:greeting": { "name": string | number };');
  });

  it("augments the module named by `augment` in the config", async () => {
    await nodeFs.writeFile(
      configPath,
      JSON.stringify({
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath,
        augment: "@acme/i18n",
      }),
    );

    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    expect(await nodeFs.readFile(outputPath, "utf-8")).toContain("declare module '@acme/i18n'");
  });

  it("fails and names the packages to declare when the project declares none", async () => {
    // Nothing to augment means the file would be inert: TypeScript reports
    // TS2882 on the generated import and `skipLibCheck: true` hides even that,
    // so every unknown key would type-check.
    await nodeFs.writeFile(join(projectDir, "package.json"), JSON.stringify({ name: "app" }));

    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 4 });

    expect(output.stderr).toContain("@comvi/react");
    expect(await nodeFs.readFile(outputPath, "utf-8").catch(() => null)).toBeNull();
  });

  it("reports the number of keys and the file it wrote", async () => {
    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    expect(output.stdout).toContain(`✓ Generated 2 keys → ${outputPath}`);
  });

  it("exits 3 when the schema request is rejected", async () => {
    stubFetch(REJECTED_SCHEMA_ROUTES);

    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 3 });

    expect(output.stderr).toContain("✗ Generation failed: Invalid API key");
  });

  it("exits 4 when the config file named by -c does not exist", async () => {
    const missing = join(dirname(configPath), "absent.json");

    await expect(
      createTypegenCommand().parseAsync(["-c", missing], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 4 });

    expect(output.stderr).toContain(`✗ Error: Config file not found: ${missing}`);
  });

  it("`comvi typegen` registers under its own name with a summary", () => {
    const command = createTypegenCommand();

    expect(command.name()).toBe("typegen");
    expect(command.description()).toContain("Generate TypeScript types from TMS");
  });

  it("documents the config and watch flags in the option help", () => {
    const options = createTypegenCommand().options;
    const byLong = (long: string) => options.find((option) => option.long === long);

    expect(byLong("--config")?.description).toContain(".comvirc.json");
    expect(byLong("--watch")?.description).toContain("Watch for changes via SSE");
  });

  it("narrates configuration loading and the schema fetch", async () => {
    await expect(
      createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });

    expect(output.stdout).toContain("Loading configuration");
    expect(output.stdout).toContain("Fetching schema from TMS");
  });

  describe("--check", () => {
    it("exits 0 when it checks the file a preceding generate wrote", async () => {
      await expect(
        createTypegenCommand().parseAsync(["-c", configPath], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 0 });

      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 0 });

      expect(output.stdout).toContain("✓ Types are up to date (2 keys)");
    });

    it("exits 1 and counts no current keys when the file has never been generated", async () => {
      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stderr).toContain("✗ Types are outdated!");
      expect(output.stderr).toContain("Current: 0 keys");
      expect(output.stderr).toContain("Expected: 2 keys");
    });

    it("exits 1 and contrasts the key counts when the file is stale", async () => {
      await nodeFs.mkdir(dirname(outputPath), { recursive: true });
      await nodeFs.writeFile(outputPath, "  interface TranslationKeys {\n    'x': never;\n  }\n");

      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stderr).toContain("Current: 1 keys");
      expect(output.stderr).toContain("Expected: 2 keys");
    });

    it("exits 3 when the key is rejected, so CI can tell a bad key from stale types", async () => {
      stubFetch(REJECTED_SCHEMA_ROUTES);

      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 3 });

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
        createTypegenCommand().parseAsync(["-c", invalidConfigPath, "--check"], {
          from: "user",
        }),
      ).rejects.toMatchObject({ exitCode: 4 });

      expect(output.stderr).toContain('"locales" is an empty list');
    });

    it.each([
      ["a null config", "null", "expected a JSON object, received null"],
      ["an array config", "[]", "expected a JSON object, received array"],
      ["a pull typo", JSON.stringify({ apiKey: "k", pull: { emptyDr: true } }), '"pull.emptyDr"'],
      [
        "a push typo",
        JSON.stringify({ apiKey: "k", push: { forceMod: "keep" } }),
        '"push.forceMod"',
      ],
      [
        "an invalid forceMode",
        JSON.stringify({ apiKey: "k", push: { forceMode: "overide" } }),
        '"push.forceMode" must be one of',
      ],
    ])("exits 4 for %s", async (_label, content, message) => {
      const invalidConfigPath = join(dirname(configPath), "invalid.comvirc.json");
      await nodeFs.writeFile(invalidConfigPath, content);

      await expect(
        createTypegenCommand().parseAsync(["-c", invalidConfigPath, "--check"], {
          from: "user",
        }),
      ).rejects.toMatchObject({ exitCode: 4 });

      expect(output.stderr).toContain(message);
    });

    it("announces the check and tells the user how to update outdated types", async () => {
      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 1 });

      expect(output.stdout).toContain("Checking if types are up to date");
      expect(output.stderr).toContain("Run 'comvi typegen' to update.");
    });

    it("exits 4, not 1, when the schema itself is unemittable", async () => {
      // A schema the emitter refuses is a validation failure, not a verdict:
      // exit 1 under --check means "types are outdated", and CI could not tell
      // the two apart. Its sibling refusal (an unsupported param type) has
      // always exited 4.
      stubFetch({
        ...SCHEMA_ROUTES,
        [PATHS.schema]: {
          body: { keys: { "default:clash": { params: [] }, clash: { params: [] } } },
        },
      });

      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 4 });

      expect(output.stderr).toContain("✗ Error: Translation key collision");
      expect(output.stderr).not.toContain("Check could not run");
    });

    it("documents the exit codes in the --check flag help", async () => {
      vi.resetModules();
      const { createTypegenCommand: freshCommand } = await import("../src/commands/generate-types");

      const checkOption = freshCommand().options.find((option) => option.long === "--check");

      expect(checkOption?.description).toContain("CI mode");
      expect(checkOption?.description).toContain(
        "exit 1 = outdated, 2 = platform unavailable, 3 = key rejected, 4 = invalid config or a schema that cannot be emitted",
      );
    });

    it("exits 3 for a TMS auth failure even on a freshly loaded module", async () => {
      vi.resetModules();
      const { createTypegenCommand: freshCommand } = await import("../src/commands/generate-types");
      stubFetch(REJECTED_SCHEMA_ROUTES);

      await expect(
        freshCommand().parseAsync(["-c", configPath, "--check"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 3 });

      expect(output.stderr).toContain("✗ Check could not run: Invalid API key");
    });
  });

  describe("--watch", () => {
    afterEach(() => {
      vi.doUnmock("eventsource");
      vi.resetModules();
    });

    async function startWatch(): Promise<{
      stream: FakeEventSource;
      interrupt: () => void;
      resume: ReturnType<typeof vi.spyOn>;
    }> {
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
      const resume = vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);

      const { createTypegenCommand: createCommand } =
        await import("../src/commands/generate-types");
      await createCommand().parseAsync(["-c", configPath, "--watch"], { from: "user" });

      if (!instances[0]) {
        throw new Error("watch mode did not open an SSE connection");
      }
      if (!interrupt) {
        throw new Error("watch mode did not register a SIGINT handler");
      }

      return { stream: instances[0], interrupt, resume };
    }

    it("rewrites the declaration file when the stream pushes a new schema", async () => {
      const { stream } = await startWatch();
      const updated: ProjectSchema = {
        keys: { ...schema.keys, "common:farewell": { params: [] } },
      };

      stream.onmessage?.({ data: JSON.stringify(updated) } as MessageEvent);

      await vi.waitFor(async () => {
        expect(await nodeFs.readFile(outputPath, "utf-8")).toContain('"common:farewell": never;');
      });
    });

    it("closes the stream and exits 0 on SIGINT", async () => {
      const { stream, interrupt } = await startWatch();
      const close = vi.spyOn(stream, "close");

      await expect(async () => interrupt()).rejects.toMatchObject({ exitCode: 0 });

      expect(close).toHaveBeenCalledOnce();
      expect(output.stdout).toContain("✓ Stopped watching");
      expect(output.stdout).toContain("Closing SSE connection");
    });

    it("narrates the watch lifecycle and keeps stdin open for updates", async () => {
      const { resume } = await startWatch();

      expect(output.stdout).toContain("Fetching initial schema from TMS");
      expect(output.stdout).toContain(`✓ Generated 2 keys → ${outputPath}`);
      expect(output.stdout).toContain("Subscribing to real-time updates");
      expect(output.stdout).toContain("Watching for changes");
      expect(output.stdout).toContain("Press Ctrl+C to stop");
      expect(resume).toHaveBeenCalledOnce();
    });

    it("narrates a pushed schema update with the new key count", async () => {
      const { stream } = await startWatch();
      const updated: ProjectSchema = {
        keys: { ...schema.keys, "common:farewell": { params: [] } },
      };

      stream.onmessage?.({ data: JSON.stringify(updated) } as MessageEvent);

      await vi.waitFor(() => {
        expect(output.stdout).toContain("Received schema update via SSE");
        expect(output.stdout).toContain(`✓ Updated 3 keys → ${outputPath}`);
      });
      expect(output.stderr).not.toContain("Update failed");
    });

    it("reports a failed update instead of claiming success", async () => {
      const { stream } = await startWatch();
      const clashing: ProjectSchema = {
        keys: { "default:clash": { params: [] }, clash: { params: [] } },
      };

      stream.onmessage?.({ data: JSON.stringify(clashing) } as MessageEvent);

      await vi.waitFor(() => {
        expect(output.stderr).toContain("Update failed: Translation key collision");
      });
      expect(output.stdout).not.toContain("✓ Updated");
    });

    it("exits 3 without subscribing when the initial generation is rejected", async () => {
      stubFetch(REJECTED_SCHEMA_ROUTES);

      await expect(
        createTypegenCommand().parseAsync(["-c", configPath, "--watch"], { from: "user" }),
      ).rejects.toMatchObject({ exitCode: 3 });

      expect(output.stderr).toContain("✗ Initial generation failed: Invalid API key");
    });
  });
});
