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
    // Reset, not clear: a test that installs a path-aware `fs.access`
    // implementation must not leak it into the next one.
    vi.resetAllMocks();
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

    it.each([
      [
        "languages",
        ["en", "uk"],
        '".comvirc.json" field "languages" is not an option: use "locales".',
      ],
      [
        "defaultNsName",
        "common",
        '".comvirc.json" field "defaultNsName" is not an option: the default namespace is read from the TMS, so delete it.',
      ],
      ["outputDir", "src/types", '".comvirc.json" field "outputDir" is not an option.'],
    ])(
      "refuses the unknown field %s and names what to write instead",
      async (key, value, message) => {
        const configPath = "/project/.comvirc.json";

        mockAccess.mockResolvedValueOnce(undefined);
        mockReadFile.mockResolvedValueOnce(JSON.stringify({ ...mockConfig, [key]: value }));

        const error = await ConfigLoader.load(configPath).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(TypegenError);
        expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
        expect((error as TypegenError).message).toBe(message);
      },
    );

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
      mockAccess
        // no .comvirc.json in cwd, and no package.json marking cwd as the root
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(undefined);
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

    it("does not adopt a .comvirc.json above the project root", async () => {
      const cwd = process.cwd();
      mockAccess.mockImplementation(async (path) => {
        if (String(path) === resolve(cwd, "package.json")) return undefined;
        if (String(path) === resolve(cwd, "..", ".comvirc.json")) return undefined;
        throw new Error("Not found");
      });
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));

      await expect(ConfigLoader.load()).rejects.toThrow("No .comvirc.json found");
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

  describe("known field value validation", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", ...extra }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    it("accepts the documented values", async () => {
      const cfg = await loadWith({
        apiBaseUrl: "http://localhost:3000/",
        outputPath: "src/i18n.d.ts",
        translationsPath: "./src/locales",
        fileTemplate: "{namespace}/{languageTag}.json",
        format: "json",
      });
      expect(cfg.format).toBe("json");
    });

    it("treats an empty apiBaseUrl as unset", async () => {
      const cfg = await loadWith({ apiBaseUrl: "" });
      expect(cfg.apiBaseUrl).toBeUndefined();
    });

    it("blames COMVI_API_BASE_URL, not the file, when the variable is not an http(s) URL", async () => {
      vi.stubEnv("COMVI_API_BASE_URL", "ftp://api.comvi.io");

      const error = await rejectionOf(loadWith({ apiBaseUrl: "https://api.test.com" }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain("(from COMVI_API_BASE_URL)");
    });

    it("reports a non-string augment as CONFIG_INVALID naming the field", async () => {
      const error = await rejectionOf(loadWith({ augment: 3 }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain('"augment" must be a non-empty string');
    });

    it.each([
      "{namespace}/{languageTag}.json",
      "{languageTag}/{namespace}.{extension}",
      "{namespace}.{languageTag}.json",
    ])("accepts the file template %s", async (fileTemplate) => {
      const cfg = await loadWith({ fileTemplate });
      expect(cfg.fileTemplate).toBe(fileTemplate);
    });

    it.each([
      ["format", "yaml", 'string "yaml"'],
      ["format", 7, "number 7"],
      ["translationsPath", 42, "number 42"],
      ["translationsPath", "  ", 'string "  "'],
      ["outputPath", ["a"], 'array ["a"]'],
      ["outputPath", "", 'string ""'],
      ["fileTemplate", false, "boolean false"],
      ["fileTemplate", "", 'string ""'],
      ["fileTemplate", "{namespace}/{languageTag}.yaml", 'string "{namespace}/{languageTag}.yaml"'],
      ["fileTemplate", "{languageTag}.json", 'string "{languageTag}.json"'],
      ["fileTemplate", "{namespace}.json", 'string "{namespace}.json"'],
      [
        "fileTemplate",
        "{namespace}/{namespace}/{languageTag}.json",
        'string "{namespace}/{namespace}/{languageTag}.json"',
      ],
      ["apiBaseUrl", 5, "number 5"],
      ["apiBaseUrl", "not a url", 'string "not a url"'],
      ["apiBaseUrl", "ftp://api.comvi.io", 'string "ftp://api.comvi.io"'],
    ])("rejects %s = %j as CONFIG_INVALID naming the field", async (field, value, received) => {
      const error = await rejectionOf(loadWith({ [field]: value }));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain(`"${field}"`);
      expect((error as TypegenError).message).toContain(`received ${received}`);
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

  /**
   * `pull.emptyDir` decides whether a pull deletes the catalog first, and a
   * string is truthy: `"false"` used to read as "yes, delete". A switch that
   * can destroy files has to be a boolean or absent, and it has to be refused
   * during `load` — before the pull opens a socket or touches the directory.
   */
  describe("boolean switch validation", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", ...extra }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    const switches: Array<[key: string, config: (value: unknown) => Record<string, unknown>]> = [
      ["pull.emptyDir", (value) => ({ pull: { emptyDir: value } })],
      ["strictParams", (value) => ({ strictParams: value })],
    ];

    describe.each(switches)("%s", (key, configFor) => {
      const invalid: Array<[label: string, value: unknown, type: string]> = [
        ['the string "false"', "false", "string"],
        ['the string "true"', "true", "string"],
        ["a number", 1, "number"],
        ["an object", {}, "object"],
        ["an array", [], "array"],
        ["null", null, "null"],
      ];

      it.each(invalid)("rejects %s", async (_label, value, type) => {
        const error = await rejectionOf(loadWith(configFor(value)));

        expect(error).toBeInstanceOf(TypegenError);
        expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
        expect((error as TypegenError).message).toContain(`"${key}"`);
        expect((error as TypegenError).message).toContain(type);
      });

      it.each([true, false])("accepts %s", async (value) => {
        await expect(loadWith(configFor(value))).resolves.toBeDefined();
      });

      it("accepts the field being absent", async () => {
        await expect(loadWith({})).resolves.toBeDefined();
      });
    });

    it("names a null value once, not twice", async () => {
      const error = await rejectionOf(loadWith({ pull: { emptyDir: null } }));

      expect((error as TypegenError).message).toContain('"pull.emptyDir" must be a boolean');
      expect((error as TypegenError).message).toContain("received null");
      expect((error as TypegenError).message).not.toContain("null null");
    });

    it("rejects a pull section that is not an object", async () => {
      const error = await rejectionOf(loadWith({ pull: "false" }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain('"pull"');
      expect((error as TypegenError).message).toContain("string");
    });

    it("rejects a push section that is not an object", async () => {
      const error = await rejectionOf(loadWith({ push: ["override"] }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain('"push"');
      expect((error as TypegenError).message).toContain("array");
    });
  });

  /**
   * `null`, an array or a scalar is valid JSON but not a config: it used to
   * reach `Object.keys` and escape as a raw TypeError (exit 1, not 4).
   */
  describe("config root", () => {
    it.each([
      ["null", "null", "null"],
      ["an array", "[]", "array"],
      ["a string", '"apiKey"', "string"],
      ["a number", "42", "number"],
      ["a boolean", "true", "boolean"],
    ])("refuses %s as the whole config", async (_label, content, type) => {
      vi.stubEnv("COMVI_API_KEY", "from-env");
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(content);

      const error = await rejectionOf(ConfigLoader.load("/project/.comvirc.json"));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        `Invalid configuration in ${resolve("/project/.comvirc.json")}: expected a JSON object, received ${type}`,
      );
    });
  });

  /**
   * The strict-field rule covers the `push` and `pull` sections too: a typo in
   * a destructive switch must not leave the CLI quietly using the default.
   */
  describe("nested section fields", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", ...extra }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    it.each([
      ["pull.emptyDr", { pull: { emptyDr: true } }],
      ["push.forceMod", { push: { forceMod: "override" } }],
      ["pull.forceMode", { pull: { forceMode: "keep" } }],
    ])("refuses the unknown field %s", async (key, extra) => {
      const error = await rejectionOf(loadWith(extra));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        `".comvirc.json" field "${key}" is not an option.`,
      );
    });

    it.each([["overide"], ["OVERRIDE"], [""], [true], [null]])(
      "refuses push.forceMode %j",
      async (value) => {
        const error = await rejectionOf(loadWith({ push: { forceMode: value } }));

        expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
        expect((error as TypegenError).message).toContain('"push.forceMode" must be one of');
      },
    );

    it.each([["override"], ["keep"], ["ask"], ["abort"]])(
      "accepts push.forceMode %s",
      async (value) => {
        await expect(loadWith({ push: { forceMode: value } })).resolves.toBeDefined();
      },
    );
  });

  describe("augment", () => {
    const loadWith = async (augment: unknown) => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", augment }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    it.each([
      ["a quote-and-newline injection", "wrapper';\ndeclare global { var injected: true }\n//"],
      ["a single quote", "a'b"],
      ["a backslash", "a\\b"],
      ["a newline", "a\nb"],
      ["inner whitespace", "my wrapper"],
    ])("refuses %s", async (_label, augment) => {
      const error = await rejectionOf(loadWith(augment));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain('"augment" must be a module specifier');
    });

    it.each([["@acme/i18n"], ["@acme/i18n/types"], ["acme-i18n"], ["  @acme/i18n  "]])(
      "accepts %j",
      async (augment) => {
        await expect(loadWith(augment)).resolves.toMatchObject({ augment: augment.trim() });
      },
    );
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
      // The failed temp write is cleaned up; the real `unlink` returns a promise.
      vi.mocked(fs.unlink).mockResolvedValueOnce(undefined);

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

  describe("sourceLocale and the check section", () => {
    const loadWith = async (extra: Record<string, unknown>) => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiKey: "k", ...extra }));
      return ConfigLoader.load("/project/.comvirc.json");
    };

    it("accepts sourceLocale", async () => {
      const cfg = await loadWith({ sourceLocale: "en" });
      expect(cfg.sourceLocale).toBe("en");
    });

    it.each([
      ["", 'string ""'],
      ["  ", 'string "  "'],
      [7, "number 7"],
      [null, "null"],
    ])("rejects sourceLocale = %j as CONFIG_INVALID naming the field", async (value, received) => {
      const error = await rejectionOf(loadWith({ sourceLocale: value }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        `Invalid configuration: "sourceLocale" must be a non-empty string, received ${received}`,
      );
    });

    it("accepts check.identical and check.strict", async () => {
      const cfg = await loadWith({ check: { identical: true, strict: false } });
      expect(cfg.check).toEqual({ identical: true, strict: false });
    });

    it("refuses the unknown field check.nope", async () => {
      const error = await rejectionOf(loadWith({ check: { nope: true } }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        '".comvirc.json" field "check.nope" is not an option.',
      );
    });

    it.each([["check.identical"], ["check.strict"]])(
      'refuses the string "false" in %s',
      async (key) => {
        const field = key.split(".")[1];
        const error = await rejectionOf(loadWith({ check: { [field]: "false" } }));

        expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
        expect((error as TypegenError).message).toBe(
          `Invalid configuration: "${key}" must be a boolean (true or false), received string "false"`,
        );
      },
    );

    it("refuses a check section that is not an object", async () => {
      const error = await rejectionOf(loadWith({ check: true }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        'Invalid configuration: "check" must be an object, received boolean',
      );
    });

    it("refuses a null check section as CONFIG_INVALID, not a TypeError", async () => {
      const error = await rejectionOf(loadWith({ check: null }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        'Invalid configuration: "check" must be an object, received null',
      );
    });
  });

  describe("offline mode", () => {
    it("returns the defaults when optional and no config file is discovered", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      const result = await ConfigLoader.load(undefined, { optional: true, requireApiKey: false });

      expect(result).toEqual({
        translationsPath: "./src/locales",
        fileTemplate: "{namespace}/{languageTag}.json",
        format: "json",
      });
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("still requires the API key on the defaults unless told otherwise", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      const error = await rejectionOf(ConfigLoader.load(undefined, { optional: true }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain("apiKey is required");
    });

    it("takes the API key for the defaults from COMVI_API_KEY unless told otherwise", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));
      vi.stubEnv("COMVI_API_KEY", "env-key");

      const result = await ConfigLoader.load(undefined, { optional: true });

      expect(result.apiKey).toBe("env-key");
    });

    it("reads the discovered file when optional and one exists", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ translationsPath: "src/i18n" }));

      const result = await ConfigLoader.load(undefined, { optional: true, requireApiKey: false });

      expect(result).toEqual({ translationsPath: "src/i18n" });
    });

    it("keeps an explicit missing path CONFIG_NOT_FOUND when optional", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      const error = await rejectionOf(
        ConfigLoader.load("/missing/.comvirc.json", { optional: true, requireApiKey: false }),
      );

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_NOT_FOUND);
      expect((error as TypegenError).message).toBe(
        `Config file not found: ${resolve("/missing/.comvirc.json")}`,
      );
    });

    it("resolves a config without apiKey when requireApiKey is false", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfigWithoutApiKey));

      const result = await ConfigLoader.load("/project/.comvirc.json", { requireApiKey: false });

      expect(result).toEqual(mockConfigWithoutApiKey);
    });

    it("does not read COMVI_API_KEY or COMVI_API_BASE_URL when requireApiKey is false", async () => {
      vi.stubEnv("COMVI_API_KEY", "garbage");
      vi.stubEnv("COMVI_API_BASE_URL", "not a url");
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ translationsPath: "src/i18n" }));

      const result = await ConfigLoader.load("/project/.comvirc.json", { requireApiKey: false });

      expect(result.apiKey).toBeUndefined();
      expect(result.apiBaseUrl).toBeUndefined();
    });

    it("does not read the API variables on the defaults when requireApiKey is false", async () => {
      vi.stubEnv("COMVI_API_KEY", "garbage");
      vi.stubEnv("COMVI_API_BASE_URL", "not a url");
      mockAccess.mockRejectedValue(new Error("Not found"));

      const result = await ConfigLoader.load(undefined, { optional: true, requireApiKey: false });

      expect(result.apiKey).toBeUndefined();
      expect(result.apiBaseUrl).toBeUndefined();
    });

    it("blames the file, not COMVI_API_BASE_URL, when the variable is not read", async () => {
      vi.stubEnv("COMVI_API_BASE_URL", "https://env.test.com");
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ apiBaseUrl: "ftp://api.comvi.io" }));

      const error = await rejectionOf(
        ConfigLoader.load("/project/.comvirc.json", { requireApiKey: false }),
      );

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        'Invalid configuration: "apiBaseUrl" must be an http(s) URL, received string "ftp://api.comvi.io"',
      );
    });

    it("still rejects an unknown field when requireApiKey is false", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ languages: ["en"] }));

      const error = await rejectionOf(
        ConfigLoader.load("/project/.comvirc.json", { requireApiKey: false, optional: true }),
      );

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toBe(
        '".comvirc.json" field "languages" is not an option: use "locales".',
      );
    });

    it("still validates scalar fields when requireApiKey is false", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ format: "yaml" }));

      const error = await rejectionOf(
        ConfigLoader.load("/project/.comvirc.json", { requireApiKey: false }),
      );

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain('"format" must be "json"');
    });

    it("still requires the API key by default", async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfigWithoutApiKey));

      const error = await rejectionOf(ConfigLoader.load("/project/.comvirc.json"));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
      expect((error as TypegenError).message).toContain("apiKey is required");
    });

    it("still reports a missing config by default", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      const error = await rejectionOf(ConfigLoader.load(undefined, { requireApiKey: false }));

      expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_NOT_FOUND);
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
