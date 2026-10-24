import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { createCheckCommand } from "../../src/commands/check";
import {
  captureConsole,
  makeTempDir,
  removeTempDirs,
  stubProcessExit,
  type ConsoleCapture,
} from "../helpers";

describe("check: a key defined twice in one catalog", () => {
  let dir: string;
  let output: ConsoleCapture;

  beforeEach(async () => {
    dir = await makeTempDir("comvi-check-dup");
    await fs.writeFile(join(dir, "package.json"), "{}");
    await fs.mkdir(join(dir, "i18n"));
    // Not `process.chdir`: Stryker runs tests in worker threads, which refuse it.
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    output = captureConsole();
    stubProcessExit();
  });

  afterEach(async () => {
    await removeTempDirs();
  });

  it("exits 4 when a key is defined both flat and through nesting", async () => {
    await fs.writeFile(join(dir, "i18n/en.json"), JSON.stringify({ "a.b": "x", a: { b: "y" } }));

    await expect(
      createCheckCommand().parseAsync(["-p", "i18n"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 4 });
    expect(output.stderr).toContain('"a.b" is defined both as a flat key and through nesting');
  });

  it("exits 0 when the same catalog is unambiguous", async () => {
    await fs.writeFile(join(dir, "i18n/en.json"), JSON.stringify({ a: { b: "y" } }));

    await expect(
      createCheckCommand().parseAsync(["-p", "i18n"], { from: "user" }),
    ).rejects.toMatchObject({ exitCode: 0 });
  });
});
