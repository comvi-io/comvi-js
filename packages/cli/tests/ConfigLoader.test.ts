import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigLoader } from "../src/core/ConfigLoader";
import { promises as fs } from "fs";
import { resolve } from "path";
import type { ComviConfig } from "../src/types";
import { ErrorCodes, TypegenError } from "../src/utils/errors";
import { rejectionOf } from "./helpers";

vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    chmod: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
  },
}));

const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockAccess = vi.mocked(fs.access);

function writtenConfigText(): string {
  const call = mockWriteFile.mock.calls[0];
  if (!call) {
    throw new Error("expected ConfigLoader to have written a config file");
  }
  return call[1] as string;
}

function writtenConfig(): Record<string, any> {
  return JSON.parse(writtenConfigText());
}

describe("ConfigLoader", () => {
  const mockConfig: ComviConfig = {
    apiKey: "test-api-key",
    apiBaseUrl: "https://api.test.com",
    outputPath: "src/types/i18n.d.ts",
    strictParams: true,
  };

  const mockConfigWithoutApiKey = {
    apiBaseUrl: "https://api.test.com",
    outputPath: "src/types/i18n.d.ts",
    strictParams: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("COMVI_API_KEY", undefined);
    vi.stubEnv("COMVI_API_BASE_URL", undefined);
  });

  describe("load", () => {
    it("should load config from specified path", async () => {
      const configPath = "/project/.comvirc.json";

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load(configPath);

      expect(result).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalledWith(resolve(configPath), "utf-8");
    });

    it("warns and ignores legacy defaultNsName from config files", async () => {
      const configPath = "/project/.comvirc.json";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          ...mockConfig,
          defaultNsName: "common",
        }),
      );

      const result = await ConfigLoader.load(configPath);

      expect(warn).toHaveBeenCalledWith(
        '[comvi] Ignoring deprecated ".comvirc.json" field "defaultNsName"; default namespace is read from the TMS.',
      );
      expect("defaultNsName" in result).toBe(false);
    });

    it("warns and ignores legacy languages field from config files", async () => {
      const configPath = "/project/.comvirc.json";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          ...mockConfig,
          languages: ["en", "uk"],
        }),
      );

      const result = await ConfigLoader.load(configPath);

      expect(warn).toHaveBeenCalledWith(
        '[comvi] Ignoring deprecated ".comvirc.json" field "languages"; it was renamed to "locales".',
      );
      expect("languages" in result).toBe(false);
    });

    it("does not warn about languages when only locales is present", async () => {
      const configPath = "/project/.comvirc.json";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          ...mockConfig,
          locales: ["en", "uk"],
        }),
      );

      await ConfigLoader.load(configPath);

      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('"languages"'));
    });

    it("discovers .comvirc.json in the current working directory", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load();

      expect(result).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalledWith(resolve(process.cwd(), ".comvirc.json"), "utf-8");
    });

    it("should auto-discover config file when no path provided", async () => {
      mockAccess.mockRejectedValueOnce(new Error("Not found")).mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load();

      expect(result).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalledWith(
        resolve(process.cwd(), "..", ".comvirc.json"),
        "utf-8",
      );
    });

    it("should throw error if config file not found", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      await expect(ConfigLoader.load()).rejects.toThrow("No .comvirc.json found");
    });

    it("should throw error if specified config file not found", async () => {
      mockAccess.mockRejectedValueOnce(new Error("Not found"));

      await expect(ConfigLoader.load("/non-existent/.comvirc.json")).rejects.toThrow(
        "Config file not found",
      );
    });

    it("should throw error for invalid JSON", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce("{ invalid json }");

      await expect(ConfigLoader.load("/project/.comvirc.json")).rejects.toThrow("Invalid JSON");
    });

    it("should throw error when apiKey missing and no env var", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ outputPath: "src/types/i18n.d.ts" }));

      await expect(ConfigLoader.load("/project/.comvirc.json")).rejects.toThrow(
        "Invalid configuration",
      );
    });

    it("falls back to a config file at the filesystem root", async () => {
      vi.spyOn(process, "cwd").mockReturnValue("/");
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load();

      expect(result).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalledWith(resolve("/", ".comvirc.json"), "utf-8");
    });

    it("propagates a non-JSON read failure without reporting invalid JSON", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      const readError = new Error("EISDIR: illegal operation on a directory, read");
      mockReadFile.mockRejectedValueOnce(readError);

      await expect(ConfigLoader.load("/project/.comvirc.json")).rejects.toBe(readError);
    });

    it("rejects a whitespace-only apiKey with the full guidance message", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "   " }));

      const error = await rejectionOf(ConfigLoader.load("/project/.comvirc.json"));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain("Invalid configuration");
      expect((error as TypegenError).message).toMatch(/ {2}- apiKey is required\n/);
      expect((error as TypegenError).message).toContain("COMVI_API_KEY");
    });

    it("rejects a non-string apiKey", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: 42 }));

      const error = await rejectionOf(ConfigLoader.load("/project/.comvirc.json"));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain("apiKey is required");
    });

    it("does not warn when the config has no legacy fields", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      await ConfigLoader.load("/project/.comvirc.json");

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("namespaces / locales filter validation", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
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

    it("lists every duplicate value separated by commas", async () => {
      await expect(
        loadWith({ namespaces: ["forest", "forest", "meadow", "meadow"] }),
      ).rejects.toThrow(/"namespaces" contains duplicate values: forest, meadow/);
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
      });
    });

    it("should use custom values when provided", () => {
      const result = ConfigLoader.toGeneratorOptions(mockConfig);

      expect(result).toEqual({
        apiKey: "test-api-key",
        apiBaseUrl: "https://api.test.com",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
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

    it("should throw when the config has no apiKey", () => {
      expect(() => ConfigLoader.toGeneratorOptions({} as ComviConfig)).toThrow(
        "API key is required",
      );
    });

    it("warns about legacy defaultNsName when converting directly", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const legacyConfig: ComviConfig & { defaultNsName?: string } = {
        apiKey: "k",
        defaultNsName: "common",
      };

      ConfigLoader.toGeneratorOptions(legacyConfig);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"defaultNsName"'));
    });
  });

  describe("create", () => {
    it("should create config file with apiKey when explicitly provided", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      const result = await ConfigLoader.create({ apiKey: "explicit-key" });

      expect(result).toBe(resolve(process.cwd(), ".comvirc.json"));
      expect(writtenConfig().apiKey).toBe("explicit-key");
    });

    it("should create config WITHOUT apiKey when not provided", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({});

      const config = writtenConfig();
      expect(config.apiKey).toBeUndefined();
      expect(config.apiBaseUrl).toBe("https://api.comvi.io");
      expect(config.outputPath).toBe("src/types/i18n.d.ts");
    });

    it("persists namespaces / locales when set (load → modify → save preserves filters)", async () => {
      // Regression: create() used to omit these fields, so a load → modify → save
      // round-trip silently dropped user filters.
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({
        apiKey: "k",
        namespaces: ["forest", "share_experience"],
        locales: ["en", "uk"],
      });

      const config = writtenConfig();
      expect(config.namespaces).toEqual(["forest", "share_experience"]);
      expect(config.locales).toEqual(["en", "uk"]);
    });

    it("omits namespaces / locales when undefined (init produces clean config without baked-in filters)", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({});

      const config = writtenConfig();
      expect("namespaces" in config).toBe(false);
      expect("locales" in config).toBe(false);
    });

    it("should create config with default values", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({ apiKey: "test-key" });

      expect(writtenConfig()).toEqual({
        apiKey: "test-key",
        apiBaseUrl: "https://api.comvi.io",
        outputPath: "src/types/i18n.d.ts",
        strictParams: true,
        translationsPath: "./src/locales",
        fileTemplate: "{namespace}/{languageTag}.json",
        format: "json",
        push: { forceMode: "ask" },
        pull: { emptyDir: false },
      });
    });

    it("persists a modified outputPath", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));
      mockWriteFile.mockResolvedValueOnce(undefined);

      const config = await ConfigLoader.load("/project/.comvirc.json");
      await ConfigLoader.create({ ...config, outputPath: "new/path/i18n.d.ts" });

      expect(writtenConfig().outputPath).toBe("new/path/i18n.d.ts");
    });

    it("should format JSON with proper indentation", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({});

      expect(writtenConfigText()).toBe(
        [
          "{",
          '  "apiBaseUrl": "https://api.comvi.io",',
          '  "outputPath": "src/types/i18n.d.ts",',
          '  "strictParams": true,',
          '  "translationsPath": "./src/locales",',
          '  "fileTemplate": "{namespace}/{languageTag}.json",',
          '  "format": "json",',
          '  "push": {',
          '    "forceMode": "ask"',
          "  },",
          '  "pull": {',
          '    "emptyDir": false',
          "  }",
          "}",
        ].join("\n"),
      );
    });

    it("should throw error if write fails", async () => {
      mockWriteFile.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(ConfigLoader.create({})).rejects.toThrow("Failed to create config file");
    });

    it("persists pull.emptyDir when explicitly enabled", async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);

      await ConfigLoader.create({ apiKey: "k", pull: { emptyDir: true } });

      expect(writtenConfig().pull.emptyDir).toBe(true);
    });

    it("passes through a non-Error write rejection unchanged", async () => {
      mockWriteFile.mockRejectedValueOnce("disk detached");

      await expect(ConfigLoader.create({})).rejects.toBe("disk detached");
    });
  });

  describe("environment variable overrides", () => {
    it("should use apiKey from COMVI_API_KEY when not in config", async () => {
      vi.stubEnv("COMVI_API_KEY", "env-api-key");

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfigWithoutApiKey));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiKey).toBe("env-api-key");
    });

    it("should override config apiKey with COMVI_API_KEY", async () => {
      vi.stubEnv("COMVI_API_KEY", "env-api-key");

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiKey).toBe("env-api-key");
    });

    it("should override apiBaseUrl from COMVI_API_BASE_URL", async () => {
      vi.stubEnv("COMVI_API_BASE_URL", "https://custom.api.com");

      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));

      const result = await ConfigLoader.load("/project/.comvirc.json");

      expect(result.apiBaseUrl).toBe("https://custom.api.com");
    });
  });

  describe("defaultConfigPath", () => {
    it("derives the default config path from the .comvirc.json filename", async () => {
      vi.resetModules();
      const { ConfigLoader: FreshConfigLoader } = await import("../src/core/ConfigLoader");

      expect(FreshConfigLoader.defaultConfigPath()).toBe(resolve(process.cwd(), ".comvirc.json"));
    });
  });
});
