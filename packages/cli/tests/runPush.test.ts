import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { createPushCommand, runPush } from "../src/commands/push";
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
  type Routes,
} from "./helpers";

/**
 * `runPush()` is `comvi push` without the process: it returns what happened
 * and throws what failed, and the command around it prints and exits exactly
 * as before.
 */

const API_BASE_URL = "https://api.test.com";
const COMMIT = "/v1/projects/123/import/commit";

const ROUTES: Routes = {
  "/v1/project": { body: { id: 123, sourceLocale: "en" } },
  "/v1/projects/123/namespaces": { body: [{ namespace: "common", isDefault: true }] },
  "/v1/project/locales": { body: { locales: [{ code: "en" }, { code: "de" }] } },
};

const COMMIT_OK = {
  body: {
    success: true,
    stats: {
      keysCreated: 1,
      keysUpdated: 0,
      keysDeleted: 0,
      translationsCreated: 1,
      translationsUpdated: 0,
      translationsSkipped: 0,
      namespacesCreated: [],
      skippedLocales: [],
    },
  },
};

describe("runPush", () => {
  let root: string;
  let localesDir: string;
  let configPath: string;
  let exits: ProcessExitCapture;
  let output: ConsoleCapture;

  async function writeFile(relativePath: string, translations: Record<string, string>) {
    const filePath = join(localesDir, relativePath);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(translations), "utf-8");
  }

  beforeEach(async () => {
    vi.stubEnv("COMVI_API_KEY", "");
    vi.stubEnv("COMVI_API_BASE_URL", "");
    exits = stubProcessExit();
    output = captureConsole();
    root = await makeTempDir("comvi-run-push");
    localesDir = join(root, "locales");
    configPath = join(root, ".comvirc.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "k", apiBaseUrl: API_BASE_URL, translationsPath: localesDir }),
    );
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it("returns the push result and never exits the process", async () => {
    await writeFile("en.json", { a: "A" });
    stubFetch({ ...ROUTES, [COMMIT]: COMMIT_OK });

    const outcome = await runPush({ config: configPath, forceMode: "override" });

    expect(outcome.status).toBe("pushed");
    expect(outcome.status === "pushed" && outcome.result.created).toBe(1);
    expect(exits.codes).toEqual([]);
  });

  it("passes scheduleAutoMt to the commit options", async () => {
    await writeFile("en.json", { a: "A" });
    const http = stubFetch({ ...ROUTES, [COMMIT]: COMMIT_OK });

    await runPush({ config: configPath, forceMode: "override", scheduleAutoMt: false });

    expect(http.jsonBodyFor(COMMIT).options).toEqual({
      conflictResolution: "keep_local",
      createNamespaces: true,
      deleteOrphans: false,
      scheduleAutoMt: false,
    });
  });

  it("returns 'empty' under allowEmpty and sends no commit", async () => {
    const http = stubFetch(ROUTES);

    const outcome = await runPush({ config: configPath, forceMode: "override", allowEmpty: true });

    expect(outcome.status).toBe("empty");
    expect(output.log).toContain("⚠  No translation values to push (--allow-empty)");
    expect(http.paths()).not.toContain(COMMIT);
    expect(exits.codes).toEqual([]);
  });

  it("throws on an empty push without allowEmpty", async () => {
    stubFetch(ROUTES);

    await expect(runPush({ config: configPath, forceMode: "override" })).rejects.toThrow(
      /No translation values to push/,
    );
    expect(exits.codes).toEqual([]);
  });

  it("returns the preview under dryRun, with both catalogs, and commits nothing", async () => {
    await writeFile("en.json", { a: "A", b: "B" });
    const http = stubFetch({
      ...ROUTES,
      "/v1/translations": {
        body: { locales: ["en", "de"], namespaces: { common: { en: { a: "A" } } } },
      },
    });

    const outcome = await runPush({ config: configPath, forceMode: "override", dryRun: true });

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.diff.created).toBe(1);
    expect(outcome.local).toEqual({ en: { common: { a: "A", b: "B" } } });
    expect(outcome.remote.en.common).toEqual({ a: "A" });
    expect(outcome.projectLocales).toEqual(["en", "de"]);
    expect(http.paths()).not.toContain(COMMIT);
  });

  it("names every locale the platform did not import", async () => {
    await writeFile("en.json", { a: "A" });
    stubFetch({
      ...ROUTES,
      [COMMIT]: {
        body: {
          success: true,
          stats: { ...COMMIT_OK.body.stats, skippedLocales: ["fr", "it"] },
        },
      },
    });

    await runPush({ config: configPath, forceMode: "override" });

    expect(output.error).toContain(
      "⚠  Not imported: fr, it — not a project locale, or this API key may not write it.",
    );
  });

  it("sends its progress lines to the given log", async () => {
    await writeFile("en.json", { a: "A" });
    stubFetch({ ...ROUTES, [COMMIT]: COMMIT_OK });
    const lines: string[] = [];

    await runPush({ config: configPath, forceMode: "override" }, { log: (l) => lines.push(l) });

    expect(lines).toContain("🔄 Pushing translations to TMS...");
    expect(output.log).toEqual([]);
  });

  it("throws an invalid force mode instead of exiting", async () => {
    stubFetch({});

    await expect(runPush({ config: configPath, forceMode: "merge" })).rejects.toThrow(
      "Invalid force-mode: merge. Use: override, keep, ask, or abort",
    );
    expect(exits.codes).toEqual([]);
  });

  it("leaves `comvi push` printing and exiting as before", async () => {
    await writeFile("en.json", { a: "A" });
    stubFetch({ ...ROUTES, [COMMIT]: COMMIT_OK });

    await createPushCommand()
      .parseAsync(["-c", configPath, "--force-mode", "override"], { from: "user" })
      .catch((error) => {
        if (!(error instanceof ExitSignal)) throw error;
      });

    expect(exits.codes[0]).toBe(0);
    expect(output.log).toEqual([
      "🔄 Loading configuration...",
      "🔄 Reading local translation files...",
      "🔄 Pushing translations to TMS...",
      "\n✓ Push complete!",
      "  Keys created: 1",
      "  Values: 1 new, 0 changed, 0 kept on the platform",
    ]);
  });
});
