import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { promises as fs } from "fs";
import { resolve } from "path";
import type { ComviConfig } from "../src/types";

vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
  },
}));

describe("ConfigLoader", () => {
  const mockConfig: ComviConfig = {
    apiKey: "test-api-key",
    apiBaseUrl: "https://api.test.com",
    outputPath: "src/types/i18n.d.ts",
    strictParams: true,
  };

  // Config without apiKey (apiKey comes from env var)
  const mockConfigWithoutApiKey = {
    apiBaseUrl: "https://api.test.com",
    outputPath: "src/types/i18n.d.ts",
    strictParams: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("load", () => {
    it("should load config from specified path", async () => {
      const configPath = "/project/.comvirc.json";
      const mockReadFile = vi.mocked(fs.readFile);
      const mockAccess = vi.mocked(fs.access);

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load(configPath);

      expect(result).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalledWith(resolve(configPath), "utf-8");
    });

    it("should auto-discover config file when no path provided", async () => {
      const mockReadFile = vi.mocked(fs.readFile);
      const mockAccess = vi.mocked(fs.access);

      // Mock directory traversal - fail first, succeed second
      mockAccess.mockRejectedValueOnce(new Error("Not found")).mockResolvedValueOnce(undefined);

      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load();

      expect(result).toEqual(mockConfig);
    });

    it("should throw error if config file not found", async () => {
      const mockAccess = vi.mocked(fs.access);

      // Simulate searching up to root without finding config
      mockAccess.mockRejectedValue(new Error("Not found"));

      await expect(ConfigLoader.load()).rejects.toThrow("No .comvirc.json found");
    });

    it("should throw error if specified config file not found", async () => {
      const mockAccess = vi.mocked(fs.access);

      mockAccess.mockRejectedValueOnce(new Error("Not found"));

      await expect(ConfigLoader.load("/non-existent/.comvirc.json")).rejects.toThrow(
        "Config file not found",
      );
    });

    it("should throw error for invalid JSON", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce("{ invalid json }");

      await expect(ConfigLoader.load("/project/.comvirc.json")).rejects.toThrow("Invalid JSON");
    });

    it("should throw error when apiKey missing and no env var", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);

      const invalidConfig = {
        // No apiKey - and no COMVI_API_KEY env var
        outputPath: "src/types/i18n.d.ts",
      };

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

      await expect(ConfigLoader.load("/project/.comvirc.json")).rejects.toThrow(
        "Invalid configuration",
      );
    });
  });

  describe("namespaces / locales filter validation", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", ...extra }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    it("accepts a valid namespaces array and trims items", async () => {
      const cfg = await loadWith({ namespaces: ["forest", "  share_experience  "] });
      expect(cfg.namespaces).toEqual(["forest", "share_experience"]);
    });

    it("accepts a valid locales array", async () => {
      const cfg = await loadWith({ locales: ["en", "uk"] });
      expect(cfg.locales).toEqual(["en", "uk"]);
    });

    it("treats undefined as 'all' (no field set)", async () => {
      const cfg = await loadWith({});
      expect(cfg.namespaces).toBeUndefined();
      expect(cfg.locales).toBeUndefined();
    });

    it("rejects an empty namespaces array with a 'remove the field' hint", async () => {
      await expect(loadWith({ namespaces: [] })).rejects.toThrow(
        /"namespaces" is an empty list — remove the field/,
      );
    });

    it("rejects a non-array namespaces field", async () => {
      await expect(loadWith({ namespaces: "forest" })).rejects.toThrow(
        /"namespaces" must be an array of strings/,
      );
    });

    it("rejects non-string items in the array", async () => {
      await expect(loadWith({ locales: ["en", 42] })).rejects.toThrow(
        /"locales" must contain only strings/,
      );
    });

    it("rejects blank-string items", async () => {
      await expect(loadWith({ namespaces: ["forest", "   "] })).rejects.toThrow(
        /"namespaces" contains an empty string/,
      );
    });

    it("rejects duplicate items after trimming", async () => {
      await expect(loadWith({ namespaces: ["forest", "forest"] })).rejects.toThrow(
        /"namespaces" contains duplicate values: forest/,
      );
    });

    it("rejects duplicates introduced by trimming", async () => {
      await expect(loadWith({ namespaces: ["forest", " forest "] })).rejects.toThrow(
        /"namespaces" contains duplicate values: forest/,
      );
    });
  });

  describe("toGeneratorOptions", () => {
    it("should convert config to generator options with defaults", () => {
      const config: ComviConfig = {
        apiKey: "test-key",
      };

      const result = ConfigLoader.toGeneratorOptions(config);

      expect(result).toEqual({
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
        defaultNsName: "default",
      });
    });

    it("should use custom values when provided", () => {
      const result = ConfigLoader.toGeneratorOptions(mockConfig);

      expect(result).toEqual({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
        defaultNsName: "default",
      });
    });

    it("should handle strictParams being false", () => {
      const config = { ...mockConfig, strictParams: false };
      const result = ConfigLoader.toGeneratorOptions(config);

      expect(result.strictParams).toBe(false);
    });

    it("should default strictParams to true when undefined", () => {
      const config = { ...mockConfig };
      delete config.strictParams;

      const result = ConfigLoader.toGeneratorOptions(config);

      expect(result.strictParams).toBe(true);
    });
  });

  describe("create", () => {
    it("should create config file with apiKey when explicitly provided", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const partialConfig: Partial<ComviConfig> = {
        apiKey: "explicit-key",
      };

      const result = await ConfigLoader.create(partialConfig);

      expect(result).toBe(resolve(process.cwd(), ".comvirc.json"));
      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("explicit-key");
    });

    it("should create config WITHOUT apiKey when not provided", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      // No apiKey provided - should use env var at runtime
      const partialConfig: Partial<ComviConfig> = {};

      await ConfigLoader.create(partialConfig);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);

      // apiKey should NOT be in the config
      expect(writtenConfig.apiKey).toBeUndefined();
      // But other defaults should be present
      expect(writtenConfig.apiBaseUrl).toBe("https://api.comvi.io");
      expect(writtenConfig.outputPath).toBe("src/types/i18n.d.ts");
    });

    it("persists namespaces / locales when set (load → modify → save preserves filters)", async () => {
      // Regression: previously create() omitted these fields, so a
      // load → modify → save round-trip silently dropped user filters.
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({
        apiKey: "k",
        namespaces: ["forest", "share_experience"],
        locales: ["en", "uk"],
      });

      const writtenConfig = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(writtenConfig.namespaces).toEqual(["forest", "share_experience"]);
      expect(writtenConfig.locales).toEqual(["en", "uk"]);
    });

    it("omits namespaces / locales when undefined (init produces clean config without baked-in filters)", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({});

      const writtenConfig = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect("namespaces" in writtenConfig).toBe(false);
      expect("locales" in writtenConfig).toBe(false);
    });

    it("should create config with default values", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const partialConfig: Partial<ComviConfig> = {
        apiKey: "test-key",
      };

      await ConfigLoader.create(partialConfig);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);

      expect(writtenConfig).toMatchObject({
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
        translationsPath: "./src/locales",
        fileTemplate: "{languageTag}/{namespace}.json",
        format: "json",
      });
    });

    it("should format JSON with proper indentation", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const partialConfig: Partial<ComviConfig> = {};

      await ConfigLoader.create(partialConfig);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;

      // Check for proper indentation (2 spaces)
      expect(writtenContent).toContain('  "apiBaseUrl"');
      expect(writtenContent).toMatch(/\n}/); // Proper closing brace
    });

    it("should throw error if write fails", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockRejectedValueOnce(new Error("Permission denied"));

      const partialConfig: Partial<ComviConfig> = {};

      await expect(ConfigLoader.create(partialConfig)).rejects.toThrow(
        "Failed to create config file",
      );
    });
  });

  describe("findConfigFile", () => {
    it("should find config in current directory", async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockResolvedValueOnce(undefined);

      const result = await (ConfigLoader as any).findConfigFile();

      expect(result).toBe(resolve(process.cwd(), ".comvirc.json"));
    });

    it("should search up directory tree", async () => {
      const mockAccess = vi.mocked(fs.access);

      // Fail current dir, succeed parent
      mockAccess.mockRejectedValueOnce(new Error("Not found")).mockResolvedValueOnce(undefined);

      const result = await (ConfigLoader as any).findConfigFile();

      const parentDir = resolve(process.cwd(), "..");
      expect(result).toBe(resolve(parentDir, ".comvirc.json"));
    });

    it("should return null when reaching filesystem root", async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockRejectedValue(new Error("Not found"));

      const result = await (ConfigLoader as any).findConfigFile();

      expect(result).toBeNull();
    });
  });

  describe("environment variable overrides", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use apiKey from COMVI_API_KEY when not in config", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);

      process.env.COMVI_API_KEY = "env-api-key";

      mockAccess.mockResolvedValueOnce(undefined);
      // Config without apiKey
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfigWithoutApiKey));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiKey).toBe("env-api-key");
    });

    it("should override config apiKey with COMVI_API_KEY", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);

      process.env.COMVI_API_KEY = "env-api-key";

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiKey).toBe("env-api-key");
    });

    it("should override apiBaseUrl from COMVI_API_BASE_URL", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);

      process.env.COMVI_API_BASE_URL = "https://custom.api.com";

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiBaseUrl).toBe("https://custom.api.com");
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete load-modify-save workflow", async () => {
      const mockAccess = vi.mocked(fs.access);
      const mockReadFile = vi.mocked(fs.readFile);
      const mockWriteFile = vi.mocked(fs.writeFile);

      // Mock file exists check and load existing config
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const config = await ConfigLoader.load("/project/.comvirc.json");

      // Modify config
      const modifiedConfig = {
        ...config,
        outputPath: "new/path/i18n.d.ts",
      };

      // Save modified config
      mockWriteFile.mockResolvedValueOnce(undefined);
      await ConfigLoader.create(modifiedConfig);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);

      expect(writtenConfig.outputPath).toBe("new/path/i18n.d.ts");
    });
  });
});
