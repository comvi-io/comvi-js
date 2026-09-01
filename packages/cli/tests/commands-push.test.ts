import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createPushCommand } from "../src/commands/push";
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
  type RouteResponse,
  type Routes,
} from "./helpers";

vi.mock("node:readline/promises", () => ({ createInterface: vi.fn() }));

/**
 * The command runs for real — ConfigLoader, ApiClient and TranslationSync all
 * execute against a temp directory; only `fetch` and the conflict prompt are
 * stubbed.
 */

const API_BASE_URL = "https://api.test.com";
const PROJECT_ID = 123;

const PATHS = {
  project: "/v1/project",
  namespaces: `/v1/projects/${PROJECT_ID}/namespaces`,
  translations: "/v1/translations",
  importCommit: `/v1/projects/${PROJECT_ID}/import/commit`,
} as const;

/** Answers the project lookup that resolves the default namespace to "common". */
const DEFAULT_NAMESPACE_ROUTES: Routes = {
  [PATHS.project]: { body: { id: PROJECT_ID } },
  [PATHS.namespaces]: { body: [{ namespace: "common", isDefault: true }] },
};

/** A commit that created one key and updated one translation. */
const COMMIT_OK: RouteResponse = {
  body: { success: true, stats: { keysCreated: 1, translationsUpdated: 1 } },
};

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

describe("comvi push", () => {
  let root: string;
  let localesDir: string;
  let exits: ProcessExitCapture;
  let output: ConsoleCapture;
  let http: FetchCapture;

  function commitBody(): Record<string, unknown> {
    return http.jsonBodyFor(PATHS.importCommit);
  }

  function setStdinTTY(isTTY: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
  }

  function scriptPrompt(answers: string[]): {
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } {
    const remaining = [...answers];
    const question = vi.fn(async () => {
      const answer = remaining.shift();
      if (answer === undefined) {
        throw new Error(`prompt asked more times than the ${answers.length} scripted answers`);
      }
      return answer;
    });
    const close = vi.fn();

    vi.mocked(createInterface).mockReturnValue({ question, close } as unknown as ReturnType<
      typeof createInterface
    >);

    return { question, close };
  }

  async function writeConfig(config: Record<string, unknown>): Promise<string> {
    const configPath = join(root, ".comvirc.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "test-key", apiBaseUrl: API_BASE_URL, ...config }),
      "utf-8",
    );
    return configPath;
  }

  async function writeTranslationFile(
    relativePath: string,
    translations: Record<string, string>,
  ): Promise<void> {
    const filePath = join(localesDir, relativePath);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(translations), "utf-8");
  }

  /**
   * The sentinel thrown by the `process.exit` spy is caught by the command's own
   * `catch`, which then exits again — in production the first call already ended
   * the process, so the first recorded code is the one that ships.
   */
  async function runPush(args: string[]): Promise<number> {
    try {
      await createPushCommand().parseAsync(args, { from: "user" });
    } catch (error) {
      if (!(error instanceof ExitSignal)) {
        throw error;
      }
    }

    if (exits.codes.length === 0) {
      throw new Error("push returned without calling process.exit");
    }
    return exits.codes[0];
  }

  beforeEach(async () => {
    vi.stubEnv("COMVI_API_KEY", "");
    vi.stubEnv("COMVI_API_BASE_URL", "");

    vi.mocked(createInterface).mockReset();
    vi.mocked(createInterface).mockImplementation(() => {
      throw new Error("the conflict prompt opened in a test that scripted no answers");
    });
    setStdinTTY(false);

    exits = stubProcessExit();
    output = captureConsole();

    root = await makeTempDir("comvi-push");
    localesDir = join(root, "locales");
  });

  afterEach(async () => {
    if (originalIsTTY) {
      Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it("uploads the local files as a namespace-keyed import commit", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    await writeTranslationFile("admin/en.json", { title: "Admin" });
    http = stubFetch({ ...DEFAULT_NAMESPACE_ROUTES, [PATHS.importCommit]: COMMIT_OK });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(commitBody()).toEqual({
      namespaces: {
        common: { en: { greeting: "Hello" } },
        admin: { en: { title: "Admin" } },
      },
      options: {
        conflictResolution: "keep_local",
        createNamespaces: true,
        deleteOrphans: false,
      },
    });
    expect(output.log).toContain("  Created: 1 keys");
    expect(output.log).toContain("  Updated: 1 translations");
  });

  it("does not fetch remote translations in override mode", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({ ...DEFAULT_NAMESPACE_ROUTES, [PATHS.importCommit]: COMMIT_OK });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(http.paths()).toEqual([PATHS.project, PATHS.namespaces, PATHS.importCommit]);
  });

  it("--dry-run reports the diff against remote and sends no import commit", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello", farewell: "Bye" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
    });

    const exitCode = await runPush(["-c", configPath, "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("  ✅ Created: 1 keys");
    expect(output.log).toContain("  📝 Updated: 1 translations");
    expect(output.log).toContain("  ⚠️  Conflicts: 1 keys");
    expect(output.log).toContain("\n  Run with --force-mode override to overwrite remote values.");
    expect(http.paths()).not.toContain(PATHS.importCommit);
  });

  it("--dry-run omits the force-mode hints when nothing conflicts", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
    });

    const exitCode = await runPush(["-c", configPath, "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("  ⚠️  Conflicts: 0 keys");
    expect(output.log).not.toContain(
      "\n  Run with --force-mode override to overwrite remote values.",
    );
  });

  it("exits 0 with a warning when there are no local translation files", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    http = stubFetch(DEFAULT_NAMESPACE_ROUTES);

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("⚠  No translation files found");
    expect(http.paths()).not.toContain(PATHS.importCommit);
  });

  it("exits 1 on an unknown --force-mode before touching the API", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({});

    const exitCode = await runPush(["-c", configPath, "--force-mode", "merge"]);

    expect(exitCode).toBe(1);
    expect(output.error[0]).toBe("✗ Invalid force-mode: merge. Use: override, keep, ask, or abort");
    expect(http.requests).toEqual([]);
  });

  it("ask mode pushes without prompting when nothing conflicts", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(0);
    expect(createInterface).not.toHaveBeenCalled();
    expect(commitBody().options).toEqual({
      conflictResolution: "keep_local",
      createNamespaces: true,
      deleteOrphans: false,
    });
  });

  it("ask mode exits 1 with an actionable hint when stdin is not a terminal", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
    });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(1);
    expect(output.error[0]).toBe(
      "✗ Push failed: --force-mode ask requires an interactive terminal. " +
        "Use --force-mode override, keep, or abort.",
    );
    expect(http.paths()).not.toContain(PATHS.importCommit);
  });

  it("ask mode answered with 'o' pushes local values and closes the prompt", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });
    setStdinTTY(true);
    const { question, close } = scriptPrompt(["o"]);

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(0);
    expect(question).toHaveBeenCalledWith(
      "Found 1 conflicting translations. Choose: [o]verride, [k]eep, [a]bort: ",
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(commitBody().options).toMatchObject({ conflictResolution: "keep_local" });
  });

  it("ask mode answered with 'k' keeps remote values and reports the skipped conflicts", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });
    setStdinTTY(true);
    scriptPrompt(["k"]);

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(0);
    expect(commitBody().options).toMatchObject({ conflictResolution: "keep_server" });
    expect(output.log).toContain("  Skipped: 1 (conflicts with keep mode)");
  });

  it("ask mode answered with 'a' exits 1 without sending an import commit", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
    });
    setStdinTTY(true);
    scriptPrompt(["a"]);

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(1);
    expect(output.error[0]).toBe(
      "✗ Push failed: Conflict detected for 1 translations. Use --force-mode override or keep.",
    );
    expect(http.paths()).not.toContain(PATHS.importCommit);
  });

  it("ask mode re-prompts after an answer it does not recognise", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });
    setStdinTTY(true);
    const { question } = scriptPrompt(["maybe", "keep"]);

    const exitCode = await runPush(["-c", configPath, "--force-mode", "ask"]);

    expect(exitCode).toBe(0);
    expect(question).toHaveBeenCalledTimes(2);
    expect(output.log).toContain("Please enter override, keep, or abort.");
    expect(commitBody().options).toMatchObject({ conflictResolution: "keep_server" });
  });

  it("reports progress once the import commit covers every local value", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", { greeting: "Hello", farewell: "Bye" });
    http = stubFetch({ ...DEFAULT_NAMESPACE_ROUTES, [PATHS.importCommit]: COMMIT_OK });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("  Progress: 2/2 (created: 1, updated: 1, skipped: 0)");
  });

  it("reports no progress when the local files hold no translation values", async () => {
    const configPath = await writeConfig({ translationsPath: localesDir });
    await writeTranslationFile("en.json", {});
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.importCommit]: {
        body: { success: true, stats: { keysCreated: 0, translationsUpdated: 0 } },
      },
    });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(output.log.filter((line) => line.startsWith("  Progress:"))).toEqual([]);
    expect(commitBody().namespaces).toEqual({ common: { en: {} } });
  });

  it("resolves conflicts with the force mode configured in .comvirc.json", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      push: { forceMode: "override" },
    });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });

    const exitCode = await runPush(["-c", configPath]);

    expect(exitCode).toBe(0);
    expect(createInterface).not.toHaveBeenCalled();
    expect(commitBody().options).toMatchObject({ conflictResolution: "keep_local" });
  });

  it("lets --force-mode replace the force mode configured in .comvirc.json", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      push: { forceMode: "override" },
    });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    http = stubFetch({
      ...DEFAULT_NAMESPACE_ROUTES,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
      [PATHS.importCommit]: COMMIT_OK,
    });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "keep"]);

    expect(exitCode).toBe(0);
    expect(commitBody().options).toMatchObject({ conflictResolution: "keep_server" });
  });

  it("uploads only the namespaces configured in .comvirc.json", async () => {
    const configPath = await writeConfig({
      translationsPath: localesDir,
      namespaces: ["admin"],
    });
    await writeTranslationFile("en.json", { greeting: "Hello" });
    await writeTranslationFile("admin/en.json", { title: "Admin" });
    http = stubFetch({ ...DEFAULT_NAMESPACE_ROUTES, [PATHS.importCommit]: COMMIT_OK });

    const exitCode = await runPush(["-c", configPath, "--force-mode", "override"]);

    expect(exitCode).toBe(0);
    expect(output.log).toContain("📄 Using namespaces from .comvirc.json: admin");
    expect(commitBody().namespaces).toEqual({ admin: { en: { title: "Admin" } } });
  });
});
