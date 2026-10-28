import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as nodeFs } from "fs";
import { join } from "path";
import { emitCatalogs, generate, type WireSchema } from "@comvi/typegen";
import { createTypegenCommand } from "../src/commands/generate-types";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  ExitSignal,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type ProcessExitCapture,
} from "./helpers";

/**
 * The command runs end to end over the typegen Node API: a real `.comvirc.json`, real
 * catalogs or a stubbed platform (`fetch` only), and a real declaration file on disk.
 */

const PROJECT_ID = 42;

const SCHEMA: WireSchema = {
  v: 2,
  sourceLocale: "en",
  namespaces: {
    common: { greeting: { params: { name: { kind: "string" } } }, welcome: {} },
  },
};

const PATHS = {
  project: "/v1/project",
  schema: `/v1/projects/${PROJECT_ID}/schema/v2`,
  stream: `/v1/projects/${PROJECT_ID}/schema/stream`,
} as const;

const SCHEMA_ROUTES = {
  [PATHS.project]: { body: { id: PROJECT_ID, name: "Acme" } },
  [PATHS.schema]: { body: SCHEMA },
};

describe("comvi typegen", () => {
  let dir: string;
  let configPath: string;
  let outputPath: string;
  let output: ConsoleCapture;
  let exits: ProcessExitCapture;

  async function run(args: string[]): Promise<number> {
    try {
      await createTypegenCommand().parseAsync(args, { from: "user" });
    } catch (error) {
      if (!(error instanceof ExitSignal)) throw error;
    }
    expect(exits.codes.length, output.stdout + output.stderr).toBeGreaterThan(0);
    return exits.codes[0];
  }

  async function writeConfig(extra: Record<string, unknown> = {}): Promise<void> {
    await nodeFs.writeFile(
      configPath,
      JSON.stringify({
        apiKey: "test-key",
        apiBaseUrl: "https://api.test.com",
        outputPath,
        ...extra,
      }),
    );
  }

  beforeEach(async () => {
    dir = await nodeFs.realpath(await makeTempDir("comvi-typegen"));
    configPath = join(dir, ".comvirc.json");
    outputPath = join(dir, "types", "i18n.d.ts");
    await writeConfig();
    // The generated declarations augment the Comvi package the project declares.
    await nodeFs.writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "app", dependencies: { "@comvi/react": "^0.8.0" } }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.stubEnv("COMVI_API_KEY", undefined);
    vi.stubEnv("COMVI_API_BASE_URL", undefined);
    vi.stubEnv("COMVI_TIMEOUT_MS", undefined);
    output = captureConsole();
    exits = stubProcessExit();
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  describe("from the platform", () => {
    it("writes exactly what emitCatalogs() writes for the route's schema v2, and exits 0", async () => {
      stubFetch(SCHEMA_ROUTES);

      expect(await run(["-c", configPath])).toBe(0);

      expect(await nodeFs.readFile(outputPath, "utf-8")).toBe(
        emitCatalogs(SCHEMA, { augment: "@comvi/react" }),
      );
      expect(output.stdout).toContain("✓ Generated 2 keys, 1 namespaces → types/i18n.d.ts");
    });

    it("sends the key as a Bearer token and never prints it", async () => {
      const http = stubFetch(SCHEMA_ROUTES);

      await run(["-c", configPath]);

      const request = http.requests.find((r) => r.url.endsWith(PATHS.schema))!;
      expect(new Headers(request.init.headers).get("authorization")).toBe("Bearer test-key");
      expect(output.stdout + output.stderr).not.toContain("test-key");
    });

    it("augments the module named by `augment` and lists defaultParams as optional", async () => {
      await writeConfig({ augment: "@acme/i18n", defaultParams: ["name"] });
      stubFetch(SCHEMA_ROUTES);

      expect(await run(["-c", configPath])).toBe(0);

      const written = await nodeFs.readFile(outputPath, "utf-8");
      expect(written).toContain("declare module '@acme/i18n'");
      expect(written).toContain('"greeting": { "name"?: string | number };');
    });

    it("fails with exit 4 and names the packages to declare when the project declares none", async () => {
      await nodeFs.writeFile(join(dir, "package.json"), JSON.stringify({ name: "app" }));
      stubFetch({});

      expect(await run(["-c", configPath])).toBe(4);

      expect(output.stderr).toContain("@comvi/react");
      await expect(nodeFs.access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("exits 3 and names the scope when the key may not read the schema", async () => {
      stubFetch({ ...SCHEMA_ROUTES, [PATHS.schema]: { status: 403, statusText: "Forbidden" } });

      expect(await run(["-c", configPath])).toBe(3);

      expect(output.stderr).toContain("schema:read");
    });

    it("leaves an unchanged file as it was (same inode) and says so", async () => {
      stubFetch(SCHEMA_ROUTES);
      await run(["-c", configPath]);
      const before = (await nodeFs.stat(outputPath)).ino;
      exits.codes.length = 0;

      expect(await run(["-c", configPath])).toBe(0);

      expect((await nodeFs.stat(outputPath)).ino).toBe(before);
      expect(output.stdout).toContain("left as it was");
    });

    it("--out overrides outputPath", async () => {
      stubFetch(SCHEMA_ROUTES);

      expect(await run(["-c", configPath, "--out", "comvi.d.ts"])).toBe(0);

      expect(await nodeFs.readFile(join(dir, "comvi.d.ts"), "utf-8")).toContain(
        "interface Catalogs",
      );
      await expect(nodeFs.access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("--from (offline)", () => {
    beforeEach(async () => {
      await nodeFs.mkdir(join(dir, "locales", "shop"), { recursive: true });
      await nodeFs.writeFile(join(dir, "locales", "en.json"), JSON.stringify({ hi: "Hi {name}" }));
      await nodeFs.writeFile(
        join(dir, "locales", "de.json"),
        JSON.stringify({ hi: "Hallo {name}" }),
      );
      await nodeFs.writeFile(
        join(dir, "locales", "shop", "en.json"),
        JSON.stringify({ items: "{n, plural, one {#} other {#}}" }),
      );
    });

    it("needs no key and no config, and writes the same bytes as generate()", async () => {
      await nodeFs.rm(configPath);
      const http = stubFetch({});

      expect(await run(["--from", "locales", "--source-locale", "en", "--out", "a.d.ts"])).toBe(0);

      const api = await generate({
        from: "locales",
        out: "b.d.ts",
        root: dir,
        sourceLocale: "en",
        onMessage: () => {},
      });
      expect(await nodeFs.readFile(join(dir, "a.d.ts"), "utf-8")).toBe(api.content);
      expect(http.requests).toEqual([]);
    });

    it("reads sourceLocale, fileTemplate and outputPath from the config", async () => {
      await writeConfig({
        sourceLocale: "de",
        fileTemplate: "{namespace}/{languageTag}.{extension}",
      });
      stubFetch({});

      expect(await run(["--from", "locales"])).toBe(0);

      const written = await nodeFs.readFile(outputPath, "utf-8");
      expect(written).toContain('"items": { "n": number };');
      expect(written).toContain('"hi": { "name": string | number };');
    });

    it("reads a wire schema file (.comvi/schema.json from comvi pull)", async () => {
      await nodeFs.mkdir(join(dir, ".comvi"));
      await nodeFs.writeFile(join(dir, ".comvi", "schema.json"), JSON.stringify(SCHEMA));
      stubFetch({});

      expect(await run(["--from", ".comvi/schema.json"])).toBe(0);

      expect(await nodeFs.readFile(outputPath, "utf-8")).toBe(
        emitCatalogs(SCHEMA, { augment: "@comvi/react" }),
      );
    });

    it("broken JSON exits 4, names the file and keeps the old declaration", async () => {
      stubFetch({});
      await run(["--from", "locales", "--source-locale", "en"]);
      const before = await nodeFs.readFile(outputPath, "utf-8");
      await nodeFs.writeFile(join(dir, "locales", "shop", "en.json"), "{ nope");
      exits.codes.length = 0;

      expect(await run(["--from", "locales", "--source-locale", "en"])).toBe(4);

      expect(output.stderr).toContain(join(dir, "locales", "shop", "en.json"));
      expect(await nodeFs.readFile(outputPath, "utf-8")).toBe(before);
    });

    it("several locales and no sourceLocale: exit 4, naming the locales", async () => {
      stubFetch({});

      expect(await run(["--from", "locales"])).toBe(4);

      expect(output.stderr).toContain("Set sourceLocale");
      expect(output.stderr).toContain("de, en");
    });
  });

  describe("--check", () => {
    it("exits 0 for the file a preceding generate wrote, and writes nothing", async () => {
      stubFetch(SCHEMA_ROUTES);
      await run(["-c", configPath]);
      const before = await nodeFs.stat(outputPath);
      exits.codes.length = 0;

      expect(await run(["-c", configPath, "--check"])).toBe(0);

      expect(output.stdout).toContain("✓ Types are up to date (2 keys, 1 namespaces)");
      expect((await nodeFs.stat(outputPath)).mtimeMs).toBe(before.mtimeMs);
    });

    it("exits 1 when the file was never generated, and writes nothing", async () => {
      stubFetch(SCHEMA_ROUTES);

      expect(await run(["-c", configPath, "--check"])).toBe(1);

      expect(output.stderr).toContain("✗ Types are outdated: types/i18n.d.ts");
      expect(output.stderr).toContain("Run 'comvi typegen' to update.");
      await expect(nodeFs.access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("exits 1 when one byte differs, and names the --from source in the hint", async () => {
      await nodeFs.mkdir(join(dir, "locales"));
      await nodeFs.writeFile(join(dir, "locales", "en.json"), JSON.stringify({ a: "A" }));
      stubFetch({});
      await run(["--from", "locales"]);
      await nodeFs.appendFile(outputPath, " ");
      exits.codes.length = 0;

      expect(await run(["--from", "locales", "--check"])).toBe(1);

      expect(output.stderr).toContain("Run 'comvi typegen --from locales' to update.");
    });

    it("exits 3 when the key is rejected, so CI can tell a bad key from stale types", async () => {
      stubFetch({ [PATHS.project]: { status: 401, statusText: "Unauthorized" } });

      expect(await run(["-c", configPath, "--check"])).toBe(3);

      expect(output.stderr).not.toContain("outdated");
    });

    it("exits 4, not 1, when the schema cannot be emitted (a reserved param name)", async () => {
      stubFetch({
        ...SCHEMA_ROUTES,
        [PATHS.schema]: {
          body: {
            ...SCHEMA,
            namespaces: { common: { a: { params: { ns: { kind: "string" } } } } },
          },
        },
      });

      expect(await run(["-c", configPath, "--check"])).toBe(4);

      expect(output.stderr).toContain("`ns` is a per-call option");
    });

    it("documents the exit codes in the --check flag help", () => {
      const help = createTypegenCommand().helpInformation().replace(/\s+/g, " ");
      expect(help).toContain(
        "exit 1 = outdated, 2 = platform unavailable, 3 = key rejected, 4 = invalid config",
      );
    });
  });

  it("registers as `typegen` and documents its flags", () => {
    const command = createTypegenCommand();
    const help = command.helpInformation().replace(/\s+/g, " ");
    expect(command.name()).toBe("typegen");
    for (const flag of [
      "--from <path>",
      "-o, --out <file>",
      "--source-locale <locale>",
      "-w, --watch",
      "--check",
      "-c, --config <path>",
    ])
      expect(help).toContain(flag);
  });

  describe("--watch on the platform (v1 stream as the signal, v2 fetched on each event)", () => {
    /** A platform whose schema stream the test drives. */
    function platform(streamStatus = 200) {
      let schema: WireSchema = SCHEMA;
      let push: ((event: string) => void) | undefined;
      const encoder = new TextEncoder();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init?: RequestInit) => {
          const path = new URL(input).pathname;
          if (path === PATHS.project) return Response.json({ id: PROJECT_ID });
          if (path === PATHS.schema) return Response.json(schema);
          if (path === PATHS.stream) {
            if (streamStatus !== 200) return new Response("", { status: streamStatus });
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                push = (event) => controller.enqueue(encoder.encode(event));
                push("data: {}\n\n");
              },
            });
            init?.signal?.addEventListener("abort", () => body.cancel().catch(() => undefined));
            return new Response(body);
          }
          throw new Error(`unexpected request: ${input}`);
        }),
      );
      return {
        set: (next: WireSchema) => void (schema = next),
        event: () => push!("data: {}\n\n"),
      };
    }

    const start = async (args: string[] = []) => {
      await createTypegenCommand().parseAsync(["-c", configPath, "--watch", ...args], {
        from: "user",
      });
    };

    it("generates, regenerates on a stream event, and exits 0 on SIGINT", async () => {
      const p = platform();
      await start();
      await vi.waitFor(() => expect(output.stdout).toContain("✓ Watching for changes..."));
      expect(await nodeFs.readFile(outputPath, "utf-8")).toContain('"welcome": never;');

      p.set({ ...SCHEMA, namespaces: { common: { ...SCHEMA.namespaces.common, bye: {} } } });
      p.event();
      await vi.waitFor(
        async () => expect(await nodeFs.readFile(outputPath, "utf-8")).toContain('"bye": never;'),
        { timeout: 5000 },
      );
      expect(output.stdout).toContain("wrote types/i18n.d.ts (3 keys, 1 namespaces)");

      expect(() => process.emit("SIGINT")).toThrow(ExitSignal);
      expect(exits.codes).toEqual([0]);
      expect(output.stdout).toContain("✓ Stopped watching");
      expect(process.listenerCount("SIGINT")).toBe(0);
    });

    it("exits 3 when the platform refuses the stream's key", async () => {
      platform(401);
      await start().catch((error) => {
        if (!(error instanceof ExitSignal)) throw error;
      });
      await vi.waitFor(() => expect(exits.codes).toEqual([3]));
      expect(output.stderr).toContain(
        "✗ Watch stopped: The schema stream refused the API key (HTTP 401)",
      );
      expect(process.listenerCount("SIGINT")).toBe(0);
    });

    it("--watch with --check is a usage error (exit 4)", async () => {
      stubFetch({});
      expect(await run(["--watch", "--check"])).toBe(4);
    });
  });
});
