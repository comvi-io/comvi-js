import { describe, it, expect, afterEach } from "vitest";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { promises as nodeFs } from "fs";
import { join } from "path";
import { makeTempDir, removeTempDirs } from "./helpers";

describe("ConfigLoader.create() on the real filesystem", () => {
  afterEach(removeTempDirs);

  it("should create config file with provided options via ConfigLoader.create", async () => {
    const outputPath = join(await makeTempDir("comvi-cli-create"), ".comvirc.json");

    const filePath = await ConfigLoader.create(
      {
        apiKey: "test-key",
        apiBaseUrl: "https://api.custom.com",
        outputPath: "custom/types/i18n.d.ts",
        defaultParams: ["brand"],
      },
      outputPath,
    );

    expect(filePath).toBe(outputPath);
    expect(JSON.parse(await nodeFs.readFile(outputPath, "utf-8"))).toMatchObject({
      apiKey: "test-key",
      apiBaseUrl: "https://api.custom.com",
      outputPath: "custom/types/i18n.d.ts",
    });
  });

  it("should merge default values for missing config options", async () => {
    const outputPath = join(await makeTempDir("comvi-cli-defaults"), ".comvirc.json");

    const filePath = await ConfigLoader.create({}, outputPath);

    expect(filePath).toBe(outputPath);
    const parsed = JSON.parse(await nodeFs.readFile(outputPath, "utf-8"));
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.apiBaseUrl).toBe("https://api.comvi.io");
    expect(parsed.outputPath).toBe("src/types/i18n.d.ts");
    expect(parsed).not.toHaveProperty("strictParams");
  });
});
