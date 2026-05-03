import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { comviTypes } from "../src";

describe("comviTypes plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fail vite build when type generation fails", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-vite-plugin-"));
    const localesDir = path.join(tempDir, "locales");

    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(path.join(localesDir, "en.json"), "{ invalid json", "utf-8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const plugin = comviTypes({
        translations: "./locales",
        output: "./src/types/i18n.d.ts",
      });

      plugin.configResolved?.({
        root: tempDir,
        command: "build",
      } as any);

      await expect(plugin.buildStart?.()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
