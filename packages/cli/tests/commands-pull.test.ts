import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createPullCommand } from "../src/commands/pull";
import { TranslationSync } from "../src/core/TranslationSync";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
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
    expect(output.stdout).toContain("Loading configuration");
    expect(output.stdout).toContain("Fetching translations from TMS");
    expect(output.stdout).toContain("Writing translation files");
    expect(output.log).toContain("\n✓ Pull complete!");
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
      locales: ["en", "uk"],
      namespaces: ["common", "admin"],
    });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en", "uk"],
          namespaces: {
            common: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } },
            admin: { en: { title: "Admin" }, uk: { title: "Адмін" } },
          },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("📄 Using locales from .comvirc.json: en, uk");
    expect(output.log).toContain("📄 Using namespaces from .comvirc.json: common, admin");
    expect(output.log).toContain("  Locales: en, uk");
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
    expect(output.log).toContain(`  ${join(localesDir, "en.json")} (new, 1 key)`);
    expect(output.log).toContain(`  ${join(localesDir, "admin", "en.json")} (new, 1 key)`);
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    { source: "the --empty-dir flag", args: ["--empty-dir"], config: {} },
    { source: "pull.emptyDir in .comvirc.json", args: [], config: { pull: { emptyDir: true } } },
  ])("clears stale translation files when $source asks for it", async ({ args, config }) => {
    const configPath = await writeConfig({ translationsPath: localesDir, ...config });
    // A namespace deleted on the platform, in a locale the pull returns.
    await fs.mkdir(join(localesDir, "stale"), { recursive: true });
    await fs.writeFile(join(localesDir, "stale", "en.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, ...args]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("🗑️  Clearing translations directory...");
    await expect(fs.access(join(localesDir, "stale"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(JSON.parse(await fs.readFile(join(localesDir, "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
  });

  /**
   * The clear runs before the write, so a name the CLI refuses has to be
   * refused before the clear: otherwise `--empty-dir` deletes the catalog,
   * rewrites the namespaces sorted before the offending one, and exits 4,
   * losing the rest on every run.
   */
  it("--empty-dir keeps the catalog when the response names an unusable namespace", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "stale.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en"],
          namespaces: {
            aaa: { en: { greeting: "Hello" } },
            "../escape": { en: { greeting: "Escaped" } },
            zzz: { en: { greeting: "Hello" } },
          },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir"]);

    expect(exitCode).toBe(4);
    expect(output.stderr).toContain("namespace from API response");
    expect(await fs.readFile(join(localesDir, "stale.json"), "utf-8")).toBe("{}");
    expect(await fs.readdir(localesDir)).toEqual(["stale.json"]);
    expect(output.stdout).not.toContain("Clearing translations directory");
  });

  it("writes a namespace containing a space, which the platform allows", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en"],
          namespaces: { "web app": { en: { greeting: "Hello" } } },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(await fs.readFile(join(localesDir, "web app", "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
  });

  /**
   * `"emptyDir": "false"` reads as "do not clear" and used to mean the
   * opposite, because a non-empty string is truthy. The run has to stop while
   * loading the config — before a request goes out and before a single file is
   * removed.
   */
  it('refuses a string "false" for pull.emptyDir without clearing or fetching', async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      pull: { emptyDir: "false" },
    });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "stale.json"), "{}", "utf-8");
    const clearDirectory = vi.spyOn(TranslationSync.prototype, "clearDirectory");
    http = stubFetch({});

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(4);
    expect(clearDirectory).not.toHaveBeenCalled();
    expect(http.requests).toEqual([]);
    expect(await fs.readFile(join(localesDir, "stale.json"), "utf-8")).toBe("{}");
    expect(output.stderr).toContain('"pull.emptyDir"');
    expect(output.stderr).toContain("string");
  });

  it("keeps stale files when neither the flag nor the config asks for a clear", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "fr.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(await fs.readFile(join(localesDir, "fr.json"), "utf-8")).toBe("{}");
  });

  it("--dry-run with --empty-dir lists the files it would remove and keeps them", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(join(localesDir, "admin"), { recursive: true });
    await fs.writeFile(join(localesDir, "en.json"), "{}", "utf-8");
    await fs.writeFile(join(localesDir, "admin", "en.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir", "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("\n🗑️  [dry-run] Would remove 2 files:");
    expect(output.log).toContain(`  ${join(localesDir, "admin", "en.json")}`);
    expect(output.log).toContain(`  ${join(localesDir, "en.json")}`);
    expect(await fs.readFile(join(localesDir, "en.json"), "utf-8")).toBe("{}");
    expect(await fs.readFile(join(localesDir, "admin", "en.json"), "utf-8")).toBe("{}");
  });

  it("--empty-dir leaves the directory untouched when the fetch fails", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "fr.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: { status: 500, statusText: "Internal Server Error", body: {} },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir"]);

    expect(exitCode).toBe(1);
    expect(await fs.readFile(join(localesDir, "fr.json"), "utf-8")).toBe("{}");
  });

  it("--empty-dir leaves the directory untouched when the server omits a requested namespace", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "fr.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir", "-n", "common,typo"]);

    expect(exitCode).toBe(4);
    expect(await fs.readFile(join(localesDir, "fr.json"), "utf-8")).toBe("{}");
  });

  /**
   * The clear and the writes are one operation: an I/O failure partway through
   * the writes (ENOSPC, a permission change) used to leave the old catalog
   * deleted and only a prefix of the new one on disk.
   */
  describe("--empty-dir with a write that fails partway", () => {
    const OLD = {
      "en.json": '{"greeting":"Old hello"}',
      "uk.json": '{"greeting":"Old pryvit"}',
      "admin/en.json": '{"title":"Old admin"}',
      "README.txt": "kept by hand",
    };

    async function seedOldCatalog(): Promise<void> {
      for (const [file, content] of Object.entries(OLD)) {
        await fs.mkdir(join(localesDir, file, ".."), { recursive: true });
        await fs.writeFile(join(localesDir, file), content, "utf-8");
      }
    }

    async function snapshot(): Promise<Record<string, string>> {
      const entries = await fs.readdir(localesDir, { withFileTypes: true, recursive: true });
      const files: Record<string, string> = {};
      for (const entry of entries.filter((e) => e.isFile())) {
        const path = join(entry.parentPath, entry.name);
        files[path.slice(localesDir.length + 1)] = await fs.readFile(path, "utf-8");
      }
      return files;
    }

    /** The second translation file's rename fails, as a full disk would. */
    function failSecondWrite(): void {
      const realRename = fs.rename.bind(fs);
      let writes = 0;
      vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
        if (String(from).endsWith(".tmp") && ++writes === 2) {
          throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
        }
        return realRename(from, to);
      });
    }

    const response = {
      locales: ["en", "uk"],
      namespaces: {
        common: { en: { greeting: "New hello" }, uk: { greeting: "New pryvit" } },
        admin: { en: { title: "New admin" }, uk: { title: "New admin uk" } },
      },
    };

    it.each([
      ["a full clear", []],
      ["a namespace-scoped clear", ["-n", "common,admin"]],
      ["a locale-scoped clear", ["-l", "en,uk"]],
    ])("restores the pre-pull catalog after %s", async (_label, filter) => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      await seedOldCatalog();
      const before = await snapshot();
      http = stubFetch({
        ...DEFAULT_NAMESPACE_ROUTES,
        [PATHS.translations]: { body: response },
      });
      failSecondWrite();

      const exitCode = await runPull(["-c", configPath, "--empty-dir", ...filter]);
      vi.restoreAllMocks();

      expect(exitCode).toBe(1);
      expect(output.stderr).toContain("ENOSPC");
      expect(await snapshot()).toEqual(before);
    });
  });

  it("--ns common --empty-dir clears only the namespaces it pulls", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(join(localesDir, "admin"), { recursive: true });
    await fs.writeFile(join(localesDir, "en.json"), '{"stale":"x"}', "utf-8");
    // `common` in `de`: received with no rows this time, so its old file goes.
    await fs.writeFile(join(localesDir, "de.json"), '{"stale":"x"}', "utf-8");
    await fs.writeFile(join(localesDir, "admin", "en.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en", "de"],
          namespaces: { common: { en: { greeting: "Hello" }, de: {} } },
        },
      },
    });

    const exitCode = await runPull(["-c", configPath, "--empty-dir", "-n", "common"]);

    expect(exitCode).toBe(0);
    expect(await fs.readFile(join(localesDir, "admin", "en.json"), "utf-8")).toBe("{}");
    expect(JSON.parse(await fs.readFile(join(localesDir, "de.json"), "utf-8"))).toEqual({});
    expect(JSON.parse(await fs.readFile(join(localesDir, "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
    });
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

  it("exits 4 without a request or a write when format is not json", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir, format: "yaml" });
    http = stubFetch({});

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toContain('"format"');
    expect(http.requests).toEqual([]);
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exits 4 without a request when translationsPath is not a string", async () => {
    const configPath = await writeConfig({ translationsPath: 42 });
    http = stubFetch({});

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toContain('"translationsPath"');
    expect(http.requests).toEqual([]);
  });

  it("round-trips a valid config: what pull writes, a later read sees in full", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir, format: "json" });
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

    expect(await runPull(["-c", configPath])).toBe(0);

    const config = await ConfigLoader.load(configPath);
    const sync = new TranslationSync({
      translationsPath: config.translationsPath ?? localesDir,
      fileTemplate: config.fileTemplate ?? DEFAULT_FILE_TEMPLATE,
      format: config.format ?? "json",
    });
    const local = await sync.readTranslations({ defaultNamespace: "common" });
    expect(local.translations).toEqual({
      en: { common: { greeting: "Hello" }, admin: { title: "Admin" } },
    });
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
  it("documents every option in its --help output", () => {
    const command = createPullCommand();

    const help = command.helpInformation().replace(/\n\s+/g, " ");

    expect(command.name()).toBe("pull");
    for (const fragment of [
      "Download translations from TMS to local files",
      "-c, --config <path>",
      "Path to .comvirc.json file",
      "-l, --locale <locales>",
      "Filter by locales (comma-separated)",
      "-n, --ns <namespaces>",
      "Filter by namespaces (comma-separated)",
      "-p, --path <path>",
      "Override translations output path",
      "--empty-dir",
      "Clear directory before pull",
      "--dry-run",
      "Show what would be written without touching files",
    ]) {
      expect(help).toContain(fragment);
    }
  });

  it("uses the documented defaults when the config omits apiBaseUrl and translationsPath", async () => {
    const configPath = await writeConfig({ apiBaseUrl: undefined });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(http.urlFor(PATHS.translations)).toBe("https://api.comvi.io/v1/translations");
    expect(JSON.parse(await fs.readFile(join(root, "src", "locales", "en.json"), "utf-8"))).toEqual(
      { greeting: "Hello" },
    );
  });

  it("exits 4 when the server does not return a requested locale", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-l", "en,de"]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toBe(
      "✗ Pull failed: Unknown locales: de. Available with this API key: en.",
    );
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  describe("--empty-dir removes only translation files of the locales it pulled", () => {
    it("keeps files that are not translation files, with the default translationsPath", async () => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      await fs.mkdir(join(localesDir, "old"), { recursive: true });
      await fs.writeFile(join(localesDir, "index.ts"), "export {}", "utf-8");
      await fs.writeFile(join(localesDir, "README.md"), "# locales", "utf-8");
      await fs.writeFile(join(localesDir, "old", "en.json"), "{}", "utf-8");
      http = stubFetch({
        ...DEFAULT_NAMESPACE_ROUTES,
        [PATHS.translations]: {
          body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
        },
      });

      expect(await runPull(["-c", configPath, "--empty-dir"])).toBe(0);

      expect(await fs.readFile(join(localesDir, "index.ts"), "utf-8")).toBe("export {}");
      expect(await fs.readFile(join(localesDir, "README.md"), "utf-8")).toBe("# locales");
      await expect(fs.access(join(localesDir, "old", "en.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("keeps the rest of the source tree when -p points at it", async () => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      const src = join(root, "src");
      await fs.mkdir(join(src, "components"), { recursive: true });
      await fs.writeFile(join(src, "components", "App.tsx"), "export const App = 1", "utf-8");
      await fs.writeFile(join(src, "main.ts"), "import './App'", "utf-8");
      await fs.writeFile(join(src, "tsconfig.json"), "{}", "utf-8");
      http = stubFetch({
        ...DEFAULT_NAMESPACE_ROUTES,
        [PATHS.translations]: {
          body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
        },
      });

      expect(await runPull(["-c", configPath, "--empty-dir", "-p", src])).toBe(0);

      expect(await fs.readFile(join(src, "components", "App.tsx"), "utf-8")).toBe(
        "export const App = 1",
      );
      expect(await fs.readFile(join(src, "main.ts"), "utf-8")).toBe("import './App'");
      expect(await fs.readFile(join(src, "tsconfig.json"), "utf-8")).toBe("{}");
      expect(JSON.parse(await fs.readFile(join(src, "en.json"), "utf-8"))).toEqual({
        greeting: "Hello",
      });
    });

    // A key restricted to some languages gets only those back. Files of the
    // other locales are outside what this pull can rewrite, so they stay —
    // also when the server still lists every project locale.
    it.each([
      ["lists only the readable locales", ["en"]],
      ["lists every project locale", ["en", "de"]],
    ])("keeps locales the response did not return when the server %s", async (_label, locales) => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      await fs.mkdir(join(localesDir, "admin"), { recursive: true });
      await fs.writeFile(join(localesDir, "de.json"), '{"greeting":"Hallo"}', "utf-8");
      await fs.writeFile(join(localesDir, "admin", "de.json"), '{"title":"Admin"}', "utf-8");
      http = stubFetch({
        ...DEFAULT_NAMESPACE_ROUTES,
        [PATHS.translations]: {
          body: { locales, namespaces: { common: { en: { greeting: "Hello" } } } },
        },
      });

      expect(await runPull(["-c", configPath, "--empty-dir"])).toBe(0);

      expect(await fs.readFile(join(localesDir, "de.json"), "utf-8")).toBe('{"greeting":"Hallo"}');
      expect(await fs.readFile(join(localesDir, "admin", "de.json"), "utf-8")).toBe(
        '{"title":"Admin"}',
      );
      expect(output.log).toContain("  Locales: en");
    });

    it("--dry-run lists exactly the files the clear would remove", async () => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      await fs.mkdir(join(localesDir, "old"), { recursive: true });
      await fs.writeFile(join(localesDir, "index.ts"), "export {}", "utf-8");
      await fs.writeFile(join(localesDir, "de.json"), "{}", "utf-8");
      await fs.writeFile(join(localesDir, "old", "en.json"), "{}", "utf-8");
      http = stubFetch({
        ...DEFAULT_NAMESPACE_ROUTES,
        [PATHS.translations]: {
          body: { locales: ["en", "de"], namespaces: { common: { en: { greeting: "Hello" } } } },
        },
      });

      expect(await runPull(["-c", configPath, "--empty-dir", "--dry-run"])).toBe(0);

      expect(output.log).toContain("\n🗑️  [dry-run] Would remove 1 files:");
      expect(output.log).toContain(`  ${join(localesDir, "old", "en.json")}`);
    });
  });

  it("exits 4 when a requested locale came back with no data, as for a restricted key", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en", "de"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPull(["-c", configPath, "-l", "en,de"]);

    expect(exitCode).toBe(4);
    expect(output.error[0]).toBe(
      "✗ Pull failed: Locales not readable with this API key: de. " +
        "The key's owner may be restricted to other languages.",
    );
    await expect(fs.access(localesDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prints the locales and namespaces it wrote, not every project locale", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: {
          locales: ["en", "de", "uk"],
          namespaces: { common: { en: { greeting: "Hello" } } },
        },
      },
    });

    expect(await runPull(["-c", configPath, "-l", "en"])).toBe(0);

    expect(output.log).toContain("  Locales: en");
    expect(output.log).not.toContain("  Locales: en, de, uk");
    expect(output.log).toContain("  Namespaces: common");
  });

  it.each([["--locale"], ["--ns"]])(
    "exits 4 without a request when %s is given empty",
    async (flag) => {
      const configPath = await writeConfig({ translationsPath: localesDir });
      http = stubFetch({});

      expect(await runPull(["-c", configPath, "--empty-dir", flag, ""])).toBe(4);

      expect(output.stderr).toContain(flag);
      expect(http.requests).toEqual([]);
    },
  );

  it("--empty-dir keeps directories it did not empty itself", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await fs.mkdir(join(localesDir, "fonts"), { recursive: true });
    await fs.mkdir(join(localesDir, "old"), { recursive: true });
    await fs.writeFile(join(localesDir, "old", "en.json"), "{}", "utf-8");
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    expect(await runPull(["-c", configPath, "--empty-dir"])).toBe(0);

    await expect(fs.readdir(join(localesDir, "fonts"))).resolves.toEqual([]);
    await expect(fs.access(join(localesDir, "old"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--empty-dir refuses a fileTemplate that puts locale and namespace in one file name", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      fileTemplate: "{languageTag}-{namespace}.json",
    });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "en-US-shop.json"), '{"a":"b"}', "utf-8");
    http = stubFetch({
      [PATHS.translations]: {
        body: { locales: ["en-US"], namespaces: { shop: { "en-US": { a: "c" } } } },
      },
    });

    expect(await runPull(["-c", configPath, "--empty-dir"])).toBe(4);

    expect(output.stderr).toContain("share a path segment");
    expect(await fs.readFile(join(localesDir, "en-US-shop.json"), "utf-8")).toBe('{"a":"b"}');
  });

  it("--empty-dir --locale en keeps the en files when the response carries no data for en", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      fileTemplate: "{languageTag}/{namespace}.json",
    });
    await fs.mkdir(join(localesDir, "en"), { recursive: true });
    await fs.writeFile(join(localesDir, "en", "common.json"), '{"keep":"me"}', "utf-8");
    http = stubFetch({
      [PATHS.translations]: { body: { locales: ["en"], namespaces: {} } },
    });

    expect(await runPull(["-c", configPath, "--empty-dir", "-l", "en"])).toBe(4);

    expect(await fs.readFile(join(localesDir, "en", "common.json"), "utf-8")).toBe('{"keep":"me"}');
  });
});
