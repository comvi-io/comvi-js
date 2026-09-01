import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as nodeFs } from "fs";
import { join } from "path";
import { createInitCommand } from "../src/commands/init";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type FetchCapture,
  type Routes,
} from "./helpers";

/**
 * `init` runs for real: ConfigLoader writes an actual `.comvirc.json` into a
 * temp directory (the command has no output flag, so `process.cwd` is the seam)
 * and only `fetch` is mocked.
 */

const PROJECT_PATH = "/v1/project";

const VALID_KEY_ROUTES: Routes = { [PROJECT_PATH]: { body: { name: "Acme Web" } } };
const REJECTED_KEY_ROUTES: Routes = {
  [PROJECT_PATH]: { status: 401, statusText: "Unauthorized" },
};

/** The `  N. …` lines of the "Next steps" list, in the order they were printed. */
function numberedSteps(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => /^ {2}(\d+\. .+)$/.exec(line)?.[1])
    .filter((step): step is string => step !== undefined);
}

describe("comvi init", () => {
  let cwd: string;
  let output: ConsoleCapture;
  let http: FetchCapture;

  const readConfig = async () =>
    JSON.parse(await nodeFs.readFile(join(cwd, ".comvirc.json"), "utf-8"));

  beforeEach(async () => {
    cwd = await makeTempDir("comvi-init");
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.stubEnv("COMVI_API_KEY", undefined);

    output = captureConsole();
    stubProcessExit();
    http = stubFetch(VALID_KEY_ROUTES);
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  it("stores the key in .comvirc.json when it is passed with --api-key", async () => {
    await createInitCommand().parseAsync(["--api-key", "flag-key"], { from: "user" });

    expect(await readConfig()).toMatchObject({ apiKey: "flag-key" });
  });

  it("warns that --api-key is exposed to other local users", async () => {
    await createInitCommand().parseAsync(["--api-key", "flag-key"], { from: "user" });

    expect(output.stderr).toContain("--api-key is visible to other local users");
  });

  it("keeps the key out of .comvirc.json when it comes from COMVI_API_KEY", async () => {
    vi.stubEnv("COMVI_API_KEY", "env-key");

    await createInitCommand().parseAsync([], { from: "user" });

    expect(await readConfig()).not.toHaveProperty("apiKey");
  });

  it("reports that the key was taken from COMVI_API_KEY", async () => {
    vi.stubEnv("COMVI_API_KEY", "env-key");

    await createInitCommand().parseAsync([], { from: "user" });

    expect(output.stdout).toContain("✓ Using API key from COMVI_API_KEY environment variable");
  });

  it("prints how to supply a key when none is configured", async () => {
    await createInitCommand().parseAsync([], { from: "user" });

    expect(output.stdout).toContain("⚠  API key not found. Set COMVI_API_KEY environment variable");
  });

  it("numbers the next steps without a gap when a key is configured", async () => {
    vi.stubEnv("COMVI_API_KEY", "env-key");

    await createInitCommand().parseAsync([], { from: "user" });

    expect(numberedSteps(output.stdout)).toEqual([
      "1. Run 'comvi generate-types' to generate types",
      "2. Run 'comvi pull' to download translations",
      "3. Run 'comvi push' to upload translations",
    ]);
  });

  it("numbers the next steps without a gap when no key is configured", async () => {
    await createInitCommand().parseAsync([], { from: "user" });

    expect(numberedSteps(output.stdout)).toEqual([
      "1. Set COMVI_API_KEY environment variable",
      "2. Run 'comvi generate-types' to generate types",
      "3. Run 'comvi pull' to download translations",
      "4. Run 'comvi push' to upload translations",
    ]);
  });

  it("does not contact the API when no key is configured", async () => {
    await createInitCommand().parseAsync([], { from: "user" });

    expect(http.paths()).toEqual([]);
  });

  it("names the project the key belongs to once validation succeeds", async () => {
    await createInitCommand().parseAsync(["--api-key", "flag-key"], { from: "user" });

    expect(output.stdout).toContain("✓ API key valid for project: Acme Web");
  });

  it("still writes the config when the key is rejected by the API", async () => {
    http = stubFetch(REJECTED_KEY_ROUTES);

    await createInitCommand().parseAsync(["--api-key", "wrong-key"], { from: "user" });

    expect(await readConfig()).toMatchObject({ apiKey: "wrong-key" });
    expect(output.stderr).toContain("⚠  API key validation failed: Invalid API key");
    expect(output.stdout).toContain("You can still create the config and fix the API key later.");
  });

  it("writes the settings given as flags", async () => {
    await createInitCommand().parseAsync(
      [
        "--api-url",
        "https://tms.example.com",
        "--output",
        "types/keys.d.ts",
        "--translations-path",
        "./locales",
        "--file-template",
        "{languageTag}/{namespace}.json",
      ],
      { from: "user" },
    );

    expect(await readConfig()).toMatchObject({
      apiBaseUrl: "https://tms.example.com",
      outputPath: "types/keys.d.ts",
      translationsPath: "./locales",
      fileTemplate: "{languageTag}/{namespace}.json",
    });
  });

  it("writes the documented defaults when no flags are given", async () => {
    await createInitCommand().parseAsync([], { from: "user" });

    expect(await readConfig()).toMatchObject({
      apiBaseUrl: "https://api.comvi.io",
      outputPath: "src/types/i18n.d.ts",
      strictParams: true,
      translationsPath: "./src/locales",
      fileTemplate: "{namespace}/{languageTag}.json",
    });
  });

  it("turns params optional with --no-strict-params", async () => {
    await createInitCommand().parseAsync(["--no-strict-params"], { from: "user" });

    expect(await readConfig()).toMatchObject({ strictParams: false });
  });

  describe("when .comvirc.json already exists", () => {
    const existing = '{"apiBaseUrl":"https://existing.example.com","locales":["en"]}';

    beforeEach(async () => {
      await nodeFs.writeFile(join(cwd, ".comvirc.json"), existing);
    });

    it("exits 1 and leaves the existing file byte for byte intact", async () => {
      await expect(createInitCommand().parseAsync([], { from: "user" })).rejects.toMatchObject({
        exitCode: 1,
      });

      expect(await nodeFs.readFile(join(cwd, ".comvirc.json"), "utf-8")).toBe(existing);
      expect(output.stderr).toContain("--force");
      expect(output.stderr).toContain("left untouched");
    });

    it("refuses before it contacts the API", async () => {
      vi.stubEnv("COMVI_API_KEY", "env-key");

      await expect(createInitCommand().parseAsync([], { from: "user" })).rejects.toMatchObject({
        exitCode: 1,
      });

      expect(http.paths()).toEqual([]);
    });

    it("replaces the file when --force is given", async () => {
      await createInitCommand().parseAsync(["--force"], { from: "user" });

      const written = await readConfig();
      expect(written).toMatchObject({ apiBaseUrl: "https://api.comvi.io" });
      expect(written).not.toHaveProperty("locales");
    });
  });

  it("exits 1 when the config file cannot be written", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(join(cwd, "does-not-exist"));

    await expect(createInitCommand().parseAsync([], { from: "user" })).rejects.toMatchObject({
      exitCode: 1,
    });
    expect(output.stderr).toContain("✗ Failed to initialize: Failed to create config file");
  });
});
