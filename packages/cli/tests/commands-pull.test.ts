import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createPullCommand } from "../src/commands/pull";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  ExitSignal,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type FetchCapture,
  type ProcessExitCapture,
  type Routes,
} from "./helpers";

/**
 * The command runs for real — ConfigLoader, ApiClient and TranslationSync all
 * execute against a temp directory; only `fetch` is stubbed.
 */

const API_BASE_URL = "https://api.test.com";
const PROJECT_ID = 123;

const PATHS = {
  project: "/v1/project",
  namespaces: `/v1/projects/${PROJECT_ID}/namespaces`,
  translations: "/v1/translations",
} as const;

/** Answers the project lookup that resolves the default namespace to "common". */
const DEFAULT_NAMESPACE_ROUTES: Routes = {
  [PATHS.project]: { body: { id: PROJECT_ID } },
  [PATHS.namespaces]: { body: [{ namespace: "common", isDefault: true }] },
};

describe("comvi pull", () => {
  let root: string;
  let localesDir: string;
  let exits: ProcessExitCapture;
  let output: ConsoleCapture;
  let http: FetchCapture;

  async function writeConfig(config: Record<string, unknown>): Promise<string> {
    const configPath = join(root, ".comvirc.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "test-key", apiBaseUrl: API_BASE_URL, ...config }),
      "utf-8",
    );
    return configPath;
  }

  /**
   * The sentinel thrown by the `process.exit` spy is caught by the command's own
   * `catch`, which then exits again — in production the first call already ended
   * the process, so the first recorded code is the one that ships.
   */
  async function runPull(args: string[]): Promise<number> {
    try {
      await createPullCommand().parseAsync(args, { from: "user" });
    } catch (error) {
      if (!(error instanceof ExitSignal)) {
        throw error;
      }
    }

    if (exits.codes.length === 0) {
      throw new Error("pull returned without calling process.exit");
    }
    return exits.codes[0];
  }

  beforeEach(async () => {
    vi.stubEnv("COMVI_API_KEY", "");
    vi.stubEnv("COMVI_API_BASE_URL", "");

    exits = stubProcessExit();
    output = captureConsole();

    root = await fs.realpath(await makeTempDir("comvi-pull"));
    localesDir = join(root, "locales");
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it("writes one file per locale and namespace, flattening the project default namespace", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en"],
          namespaces: {
            common: { en: { greeting: "Hello" } },
            admin: { en: { title: "Admin" } },
          },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(await fs.readFile(join(localesDir, "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
    expect(JSON.parse(await fs.readFile(join(localesDir, "admin", "en.json"), "utf-8"))).toEqual({
      title: "Admin",
    });
    expect(output.log).toContain("  Locales: en");
    expect(output.log).toContain("  Namespaces: common, admin");
    expect(output.log).toContain("  Files written: 2");
  });

  it("sends --locale and --ns as query filters on the translations request", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en", "uk"],
          namespaces: { common: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } } },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-l", "en,uk", "-n", "common"]);

    expect(exitCode).toBe(0);
    expect(http.urlFor(PATHS.translations)).toBe(
      `${API_BASE_URL}/v1/translations?locales=en%2Cuk&namespaces=common`,
    );
  });

  it("announces the locales and namespaces it took from .comvirc.json", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      locales: ["en"],
      namespaces: ["common"],
    });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("📄 Using locales from .comvirc.json: en");
    expect(output.log).toContain("📄 Using namespaces from .comvirc.json: common");
  });

  it("lets --locale replace the locales configured in .comvirc.json", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir, locales: ["en"] });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["uk"], namespaces: { common: { uk: { greeting: "Привіт" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-l", "uk"]);

    expect(exitCode).toBe(0);
    expect(http.urlFor(PATHS.translations)).toBe(`${API_BASE_URL}/v1/translations?locales=uk`);
    expect(output.log).not.toContain("📄 Using locales from .comvirc.json: en");
  });

  it("--dry-run lists the files it would write and leaves the filesystem untouched", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en"],
          namespaces: {
            common: { en: { greeting: "Hello" } },
            admin: { en: { title: "Admin" } },
          },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("\n✓ [dry-run] Would write 2 files:");
    expect(output.log).toContain(`  ${join(localesDir, "en.json")}`);
    expect(output.log).toContain(`  ${join(localesDir, "admin", "en.json")}`);
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    { source: "the --empty-dir flag", args: ["--empty-dir"], config: {} },
    { source: "pull.emptyDir in .comvirc.json", args: [], config: { pull: { emptyDir: true } } },
  ])("clears stale translation files when $source asks for it", async ({ args, config }) => {
    const configPath = await writeConfig({ translationsPath: localesDir, ...config });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "stale.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, ...args]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("🗑️  Clearing translations directory...");
    await expect(fs.access(join(localesDir, "stale.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(JSON.parse(await fs.readFile(join(localesDir, "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
  });

  it("--dry-run with --empty-dir keeps the existing files in place", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "stale.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir", "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("🗑️  [dry-run] Would clear translations directory");
    expect(await fs.readFile(join(localesDir, "stale.json"), "utf-8")).toBe("{}");
  });

  it("exits 4 when the server does not return a requested namespace", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-n", "common,typo"]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toBe(
      "✗ Pull failed: Unknown namespaces: typo. Available in project: common.",
    );
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exits 4 without calling the API when .comvirc.json is invalid", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir, locales: [] });
    http = stubFetch({});

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toContain('"locales" is an empty list');
    expect(http.requests).toEqual([]);
  });

  it("exits 1 when the translations request is rejected", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: { status: 403, statusText: "Forbidden" },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(1);
    expect(output.error[0]).toBe("✗ Pull failed: Access denied to this project");
  });

  it("exits 1 when the config file does not exist", async () => {
    http = stubFetch({});

    const exitCode = await runPull(["-c", join(root, "absent.json")]);

    expect(exitCode).toBe(1);
    expect(output.error[0]).toBe(
      `✗ Pull failed: Config file not found: ${join(root, "absent.json")}`,
    );
  });

  it("writes to the --path directory instead of the configured translationsPath", async () => {
    const configPath = await writeConfig({ translationsPath: join(root, "configured") });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-p", join(root, "override")]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(await fs.readFile(join(root, "override", "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
    await expect(fs.access(join(root, "configured"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("skips the default-namespace lookup when a custom fileTemplate is configured", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      fileTemplate: "{languageTag}/{namespace}.json",
    });
    http = stubFetch({
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(http.paths()).toEqual([PATHS.translations]);
    expect(JSON.parse(await fs.readFile(join(localesDir, "en", "common.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
  });
});
