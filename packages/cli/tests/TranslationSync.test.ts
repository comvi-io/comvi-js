import { promises as fs } from "fs";
import { join, relative } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { TranslationSync } from "../src/core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { makeTempDir, removeTempDirs } from "./helpers";

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
});
