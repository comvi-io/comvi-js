import { promises as fs } from "fs";
import { join, relative } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationSync } from "../src/core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { ErrorCodes, TypegenError } from "../src/utils/errors";
import { makeTempDir, rejectionOf, removeTempDirs } from "./helpers";

describe("TranslationSync", () => {
  afterEach(removeTempDirs);

  it("counts changed existing keys once as updates and conflicts", () => {
    const sync = new TranslationSync({
      translationsPath: "src/locales",
      fileTemplate: "{languageTag}/{namespace}.json",
      format: "json",
    });

    const diff = sync.compareTranslations(
      {
        en: {
          common: {
            added: "Added locally",
            changed: "Local",
          },
        },
      },
      {
        en: {
          common: {
            changed: "Remote",
            removed: "Remote only",
          },
        },
      },
    );

    expect(diff).toEqual({
      created: 1,
      updated: 1,
      conflicts: 1,
      deleted: 1,
    });
  });

  it("reads locale tags with digits and underscores from template paths", async () => {
    const dir = await makeTempDir("comvi-cli-sync");

    await fs.mkdir(join(dir, "de-DE-1996"), { recursive: true });
    await fs.writeFile(join(dir, "de-DE-1996", "common.json"), '{"hello":"Hallo"}\n');
    await fs.mkdir(join(dir, "zh_Hans"), { recursive: true });
    await fs.writeFile(join(dir, "zh_Hans", "common.json"), '{"hello":"Ni hao"}\n');

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: "{languageTag}/{namespace}.json",
      format: "json",
    });

    const result = await sync.readTranslations();

    expect([...result.locales].sort()).toEqual(["de-DE-1996", "zh_Hans"]);
    expect(result.translations["de-DE-1996"].common.hello).toBe("Hallo");
    expect(result.translations.zh_Hans.common.hello).toBe("Ni hao");
  });

  it("writes default namespace files at the locale root with the default layout", async () => {
    const dir = await makeTempDir("comvi-cli-sync");

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const result = await sync.writeTranslations(
      {
        locales: ["en"],
        namespaces: ["common", "admin"],
        translations: {
          en: {
            common: { hello: "Hello" },
            admin: { dashboard: "Dashboard" },
          },
        },
      },
      { defaultNamespace: "common" },
    );

    expect(result.filesWritten).toBe(2);
    await expect(fs.readFile(join(dir, "en.json"), "utf-8")).resolves.toContain('"hello": "Hello"');
    await expect(fs.readFile(join(dir, "admin", "en.json"), "utf-8")).resolves.toContain(
      '"dashboard": "Dashboard"',
    );
  });

  it("reads default namespace files from the locale root with the default layout", async () => {
    const dir = await makeTempDir("comvi-cli-sync");

    await fs.writeFile(join(dir, "en.json"), '{"hello":"Hello"}\n');
    await fs.mkdir(join(dir, "admin"), { recursive: true });
    await fs.writeFile(join(dir, "admin", "en.json"), '{"dashboard":"Dashboard"}\n');

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const result = await sync.readTranslations({ defaultNamespace: "common" });

    expect(result.locales).toEqual(["en"]);
    expect([...result.namespaces].sort()).toEqual(["admin", "common"]);
    expect(result.translations).toEqual({
      en: {
        common: { hello: "Hello" },
        admin: { dashboard: "Dashboard" },
      },
    });
  });

  it("rejects duplicate files that map to the same locale and namespace", async () => {
    const dir = await makeTempDir("comvi-cli-sync");

    await fs.writeFile(join(dir, "en.json"), '{"hello":"Hello"}\n');
    await fs.mkdir(join(dir, "common"), { recursive: true });
    await fs.writeFile(join(dir, "common", "en.json"), '{"hello":"Duplicate"}\n');

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    await expect(sync.readTranslations({ defaultNamespace: "common" })).rejects.toThrow(
      'Duplicate translation files for locale "en" and namespace "common"',
    );
  });

  it("does not treat regex metacharacters in templates as wildcards", async () => {
    const dir = await makeTempDir("comvi-cli-sync");

    await fs.writeFile(join(dir, "localeXenXcommon.json"), '{"bad":"match"}\n');

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: "locale.{languageTag}.{namespace}.json",
      format: "json",
    });

    const result = await sync.readTranslations();

    expect(result.locales).toEqual([]);
    expect(result.translations).toEqual({});
  });

  it("refuses to clear directories outside the current project", async () => {
    const dir = await makeTempDir("comvi-cli-outside");

    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: "{languageTag}/{namespace}.json",
      format: "json",
    });

    await expect(sync.clearDirectory()).rejects.toThrow(
      "Refusing to clear translations directory outside the current project",
    );
  });

  it("empties a translations directory inside the project and leaves it in place", async () => {
    // clearDirectory refuses paths outside process.cwd(), so this one temp dir
    // must live inside the package.
    const dir = await fs.mkdtemp(join(process.cwd(), "tmp-cli-clear-"));
    try {
      await fs.mkdir(join(dir, "en"), { recursive: true });
      await fs.writeFile(join(dir, "en", "common.json"), "{}\n");

      const sync = new TranslationSync({
        translationsPath: relative(process.cwd(), dir),
        fileTemplate: "{languageTag}/{namespace}.json",
        format: "json",
      });

      await sync.clearDirectory();

      await expect(fs.readdir(dir)).resolves.toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("previews the file paths writeTranslations would produce without writing them", async () => {
    const dir = await makeTempDir("comvi-cli-preview");
    const sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const { files } = sync.previewTranslations(
      {
        locales: ["en"],
        namespaces: ["common", "admin"],
        translations: {
          en: {
            common: { hello: "Hello" },
            admin: { dashboard: "Dashboard" },
          },
        },
      },
      { defaultNamespace: "common" },
    );

    expect(files).toEqual([join(dir, "en.json"), join(dir, "admin", "en.json")]);
    await expect(fs.readdir(dir)).resolves.toEqual([]);
  });

  it("reports no changes when local and remote are identical", () => {
    const sync = new TranslationSync({
      translationsPath: "src/locales",
      fileTemplate: "{languageTag}/{namespace}.json",
      format: "json",
    });

    const side = { en: { common: { hello: "Hello" } } };

    expect(sync.compareTranslations(side, side)).toEqual({
      created: 0,
      updated: 0,
      conflicts: 0,
      deleted: 0,
    });
  });

  const makeSync = (translationsPath: string, fileTemplate = "{languageTag}/{namespace}.json") =>
    new TranslationSync({ translationsPath, fileTemplate, format: "json" });

  it("skips locales missing from the translations payload", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const sync = makeSync(dir);

    const result = await sync.writeTranslations({
      locales: ["en", "de"],
      namespaces: ["common"],
      translations: { en: { common: { hello: "Hello" } } },
    });

    expect(result.filesWritten).toBe(1);
    await expect(fs.access(join(dir, "de"))).rejects.toThrow(/ENOENT/);
  });

  it("skips namespaces missing from a locale", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const sync = makeSync(dir);

    const result = await sync.writeTranslations({
      locales: ["en"],
      namespaces: ["common", "extra"],
      translations: { en: { common: { hello: "Hello" } } },
    });

    expect(result.filesWritten).toBe(1);
    await expect(fs.access(join(dir, "en", "extra.json"))).rejects.toThrow(/ENOENT/);
  });

  it("terminates written translation files with a newline", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const sync = makeSync(dir);

    await sync.writeTranslations({
      locales: ["en"],
      namespaces: ["common"],
      translations: { en: { common: { hello: "Hello" } } },
    });

    const content = await fs.readFile(join(dir, "en", "common.json"), "utf-8");
    expect(content.endsWith("\n")).toBe(true);
    expect(JSON.parse(content)).toEqual({ hello: "Hello" });
  });

  it("previews only files whose translations exist", async () => {
    const dir = await makeTempDir("comvi-cli-preview");
    const sync = makeSync(dir, DEFAULT_FILE_TEMPLATE);

    const { files } = sync.previewTranslations(
      {
        locales: ["en", "de"],
        namespaces: ["common", "extra"],
        translations: { en: { common: { hello: "Hello" } } },
      },
      { defaultNamespace: "common" },
    );

    expect(files).toEqual([join(dir, "en.json")]);
  });

  it("reads only the requested locales", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    await fs.mkdir(join(dir, "en"), { recursive: true });
    await fs.writeFile(join(dir, "en", "common.json"), '{"hello":"Hello"}\n');
    await fs.mkdir(join(dir, "de"), { recursive: true });
    await fs.writeFile(join(dir, "de", "common.json"), '{"hello":"Hallo"}\n');
    const sync = makeSync(dir);

    const result = await sync.readTranslations({ locales: ["en"] });

    expect(result.locales).toEqual(["en"]);
    expect(result.translations).toEqual({ en: { common: { hello: "Hello" } } });
  });

  it("reports the offending file for invalid JSON", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const file = join(dir, "en", "common.json");
    await fs.mkdir(join(dir, "en"), { recursive: true });
    await fs.writeFile(file, "{ nope");
    const sync = makeSync(dir);

    const error = await rejectionOf(sync.readTranslations());

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as TypegenError).message).toContain("Invalid JSON in ");
    expect((error as TypegenError).message).toContain(file);
  });

  it("wraps unreadable translation files with FS_READ_FAILED", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const file = join(dir, "en", "common.json");
    await fs.mkdir(join(dir, "en"), { recursive: true });
    await fs.writeFile(file, '{"hello":"Hello"}\n');
    await fs.chmod(file, 0o000);
    const sync = makeSync(dir);

    try {
      const error = await rejectionOf(sync.readTranslations());

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.FS_READ_FAILED);
      expect((error as TypegenError).message).toContain("Failed to read ");
      expect((error as TypegenError).message).toContain(file);
    } finally {
      await fs.chmod(file, 0o644);
    }
  });

  it("refuses to clear the working directory itself", async () => {
    const dir = await makeTempDir("comvi-cli-guard");
    await fs.writeFile(join(dir, "sentinel.txt"), "keep");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const sync = makeSync(dir);

    await expect(sync.clearDirectory()).rejects.toThrow("Refusing to clear translations directory");

    await expect(fs.readFile(join(dir, "sentinel.txt"), "utf-8")).resolves.toBe("keep");
  });

  it("refuses to clear the parent of the working directory", async () => {
    const dir = await makeTempDir("comvi-cli-guard");
    const child = join(dir, "child");
    await fs.mkdir(child);
    await fs.writeFile(join(dir, "sentinel.txt"), "keep");
    vi.spyOn(process, "cwd").mockReturnValue(child);
    const sync = makeSync(dir);

    await expect(sync.clearDirectory()).rejects.toThrow("Refusing to clear translations directory");

    await expect(fs.readFile(join(dir, "sentinel.txt"), "utf-8")).resolves.toBe("keep");
  });

  it("clears a translations directory that does not exist yet", async () => {
    const dir = await makeTempDir("comvi-cli-clear");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const sync = makeSync(join(dir, "locales"));

    await sync.clearDirectory();

    await expect(fs.readdir(join(dir, "locales"))).resolves.toEqual([]);
  });

  it("wraps filesystem failures while clearing with FS_WRITE_FAILED", async () => {
    const dir = await makeTempDir("comvi-cli-clear");
    const locked = join(dir, "locked");
    const target = join(locked, "locales");
    await fs.mkdir(target, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const sync = makeSync(target);
    await fs.chmod(locked, 0o555);

    try {
      const error = await rejectionOf(sync.clearDirectory());

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.FS_WRITE_FAILED);
      expect((error as TypegenError).message).toContain("Failed to clear directory");
    } finally {
      await fs.chmod(locked, 0o755);
    }
  });

  it("parses Windows-style file templates on POSIX", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const sync = makeSync(dir, "{namespace}\\{languageTag}.json");

    await sync.writeTranslations({
      locales: ["en"],
      namespaces: ["common"],
      translations: { en: { common: { hello: "Hallo" } } },
    });
    const result = await sync.readTranslations();

    expect(result.locales).toEqual(["en"]);
    expect(result.namespaces).toEqual(["common"]);
    expect(result.translations.en.common.hello).toBe("Hallo");
  });

  it("honors the {extension} placeholder and ignores other extensions", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    await fs.mkdir(join(dir, "common"), { recursive: true });
    await fs.writeFile(join(dir, "common", "en.json"), '{"hello":"Hello"}\n');
    await fs.writeFile(join(dir, "common", "en.yaml"), '{"stray":"x"}\n');
    const sync = makeSync(dir, "{namespace}/{languageTag}.{extension}");

    const result = await sync.readTranslations();

    expect(result.locales).toEqual(["en"]);
    expect(result.translations).toEqual({ en: { common: { hello: "Hello" } } });
  });

  it("skips files when the template has no locale placeholder", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    await fs.writeFile(join(dir, "static.json"), '{"a":"b"}\n');
    const sync = makeSync(dir, "static.json");

    const result = await sync.readTranslations();

    expect(result.locales).toEqual([]);
    expect(result.translations).toEqual({});
  });

  it("propagates scan failures other than a missing directory", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const filePath = join(dir, "not-a-directory");
    await fs.writeFile(filePath, "plain file\n");
    const sync = makeSync(filePath);

    await expect(sync.readTranslations()).rejects.toThrow(/ENOTDIR/);
  });

  it("ignores directory entries that are neither files nor directories", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    await fs.writeFile(join(dir, "en.json"), '{"hello":"Hello"}\n');
    await fs.symlink(join(dir, "en.json"), join(dir, "de.json"));
    const sync = makeSync(dir, DEFAULT_FILE_TEMPLATE);

    const result = await sync.readTranslations();

    expect(result.locales).toEqual(["en"]);
  });

  it("wraps directory-creation failures with FS_MKDIR_FAILED", async () => {
    const dir = await makeTempDir("comvi-cli-sync");
    const blocker = join(dir, "blocker");
    await fs.writeFile(blocker, "a file where a directory is needed\n");
    const sync = makeSync(join(blocker, "locales"));

    const error = await rejectionOf(
      sync.writeTranslations({
        locales: ["en"],
        namespaces: ["common"],
        translations: { en: { common: { hello: "Hello" } } },
      }),
    );

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.FS_MKDIR_FAILED);
    expect((error as TypegenError).message).toContain("Failed to create directory");
  });
});
