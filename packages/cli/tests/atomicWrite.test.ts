import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile, createAtomicTempPath } from "../src/utils/atomicWrite";
import { ConfigLoader } from "../src/core/ConfigLoader";
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

/**
 * `comvi init --force` replaces an existing `.comvirc.json`. The keyless config
 * (the recommended one) used to go through a plain `writeFile`, which
 * truncates the target first: a write that failed halfway destroyed the old
 * config while the command reported failure.
 */
describe("ConfigLoader.create overwriting an existing config", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await removeTempDirs();
  });

  it.each([
    ["a keyless config", {}],
    ["a config with an embedded key", { apiKey: "secret" }],
  ])("leaves the old file byte-identical when writing %s fails", async (_label, extra) => {
    const dir = await makeTempDir("comvi-init-force");
    const target = join(dir, ".comvirc.json");
    const original = '{\n  "apiBaseUrl": "https://old.example",\n  "locales": ["en", "uk"]\n}';
    await fs.writeFile(target, original);

    // Disk fills mid-write: a prefix lands, then the write fails.
    const realWriteFile = fs.writeFile.bind(fs);
    vi.spyOn(fs, "writeFile").mockImplementation(async (path, data, options) => {
      await realWriteFile(path, String(data).slice(0, 5), options);
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    });

    await expect(
      ConfigLoader.create({ apiBaseUrl: "https://new.example", ...extra }, target),
    ).rejects.toMatchObject({ code: "CONFIG_WRITE_FAILED" });

    vi.restoreAllMocks();
    await expect(fs.readFile(target, "utf-8")).resolves.toBe(original);
    await expect(fs.readdir(dir)).resolves.toEqual([".comvirc.json"]);
  });
});
