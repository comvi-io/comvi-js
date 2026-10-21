import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { createInitCommand } from "../src/commands/init";
import { createPullCommand } from "../src/commands/pull";
import { createPushCommand } from "../src/commands/push";
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
  type FetchCapture,
  type ProcessExitCapture,
} from "./helpers";

/** A bad COMVI_TIMEOUT_MS is a configuration error: exit 4, before any request. */
describe("COMVI_TIMEOUT_MS in every command", () => {
  let root: string;
  let exits: ProcessExitCapture;
  let output: ConsoleCapture;
  let http: FetchCapture;

  beforeEach(async () => {
    vi.stubEnv("COMVI_API_KEY", "test-key");
    vi.stubEnv("COMVI_API_BASE_URL", "");
    vi.stubEnv("COMVI_TIMEOUT_MS", "10s");
    exits = stubProcessExit();
    output = captureConsole();
    http = stubFetch({});
    root = await fs.realpath(await makeTempDir("comvi-timeout-env"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    await fs.writeFile(
      join(root, ".comvirc.json"),
      JSON.stringify({ apiBaseUrl: "https://api.test.com", translationsPath: "./locales" }),
    );
  });

  afterEach(async () => {
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  async function run(command: Command, args: string[] = []): Promise<number> {
    try {
      await command.parseAsync(args, { from: "user" });
    } catch (error) {
      if (!(error instanceof ExitSignal)) throw error;
    }
    expect(exits.codes.length).toBeGreaterThan(0);
    return exits.codes[0];
  }

  it.each([
    ["pull", () => createPullCommand(), []],
    ["push", () => createPushCommand(), ["--force-mode", "override"]],
    ["typegen", () => createTypegenCommand(), []],
    ["typegen --check", () => createTypegenCommand(), ["--check"]],
    ["init --force", () => createInitCommand(), ["--force"]],
  ] as const)("%s exits 4", async (_name, create, args) => {
    expect(await run(create(), [...args])).toBe(4);
    expect(output.stderr).toContain("COMVI_TIMEOUT_MS");
    expect(http.requests).toEqual([]);
  });
});
