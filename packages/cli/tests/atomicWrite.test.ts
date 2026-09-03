import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile, createAtomicTempPath } from "../src/utils/atomicWrite";
import { makeTempDir, removeTempDirs } from "./helpers";

// A fixed UUID makes createAtomicTempPath deterministic, so a test can occupy
// the exact temp path atomicWriteFile is about to claim.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => "00000000-0000-4000-8000-000000000000" };
});

describe("atomicWriteFile", () => {
  afterEach(removeTempDirs);

  it("writes the content to the target path and cleans up its temp file", async () => {
    const dir = await makeTempDir("comvi-atomic");
    const target = join(dir, "out.json");

    await atomicWriteFile(target, '{"ok":true}');

    await expect(fs.readFile(target, "utf-8")).resolves.toBe('{"ok":true}');
    await expect(fs.readdir(dir)).resolves.toEqual(["out.json"]);
  });

  it("refuses to reuse an already-occupied temp path and leaves no target behind", async () => {
    const dir = await makeTempDir("comvi-atomic");
    const target = join(dir, "out.json");
    const tempPath = createAtomicTempPath(target);
    await fs.writeFile(tempPath, "unrelated data");

    await expect(atomicWriteFile(target, "new data")).rejects.toThrow(/EEXIST/);

    expect(existsSync(target)).toBe(false);
  });
});
