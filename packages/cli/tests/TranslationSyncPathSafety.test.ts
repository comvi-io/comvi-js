import { promises as fs } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { TranslationSync } from "../src/core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { ErrorCodes, TypegenError } from "../src/utils/errors";
import { makeTempDir, rejectionOf, removeTempDirs, thrownBy } from "./helpers";

/**
 * Locales and namespaces are interpolated into a file path, and they arrive
 * from the API response — not from the project. A response that names a locale
 * `../../outside` must not be able to place a file outside the configured
 * translations directory, on the preview path or on the write path.
 */

const CATALOG = { hello: "Hello" };

function responseFor(locale: string, namespace: string) {
  return {
    locales: [locale],
    namespaces: [namespace],
    translations: { [locale]: { [namespace]: CATALOG } },
  };
}

/** Every file below `dir`, relative to it, sorted. */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

describe("TranslationSync path containment", () => {
  afterEach(removeTempDirs);

  const traversals: Array<[label: string, identifier: string]> = [
    ["parent traversal", "../../outside"],
    ["single parent segment", ".."],
    ["absolute path", "/etc/comvi-escape"],
    ["backslash traversal", "..\\..\\outside"],
    ["nested separator", "nested/deep"],
    ["leading dot", ".hidden"],
    ["prototype key", "__proto__"],
    ["empty string", ""],
  ];

  describe.each(traversals)("rejects a %s as the locale", (_label, identifier) => {
    it("on the preview path", async () => {
      const root = await makeTempDir("comvi-cli-containment");
      const sync = new TranslationSync({
        translationsPath: join(root, "locales"),
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const error = thrownBy(() => sync.previewTranslations(responseFor(identifier, "default")));

      expect(error).toBeInstanceOf(TypegenError);
      expect(error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      // Quoted, so an empty or whitespace-only identifier is still visible.
      expect(error.message).toContain(JSON.stringify(identifier));
      expect(error.message).toContain("locale from API response");
    });

    it("on the write path, without creating a file", async () => {
      const root = await makeTempDir("comvi-cli-containment");
      const sync = new TranslationSync({
        translationsPath: join(root, "locales"),
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const error = await rejectionOf(sync.writeTranslations(responseFor(identifier, "default")));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(await listFiles(root)).toEqual([]);
    });
  });

  describe.each(traversals)("rejects a %s as the namespace", (_label, identifier) => {
    it("on the write path, without creating a file", async () => {
      const root = await makeTempDir("comvi-cli-containment");
      const sync = new TranslationSync({
        translationsPath: join(root, "locales"),
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const error = await rejectionOf(sync.writeTranslations(responseFor("en", identifier)));

      expect(error).toBeInstanceOf(TypegenError);
      expect((error as TypegenError).code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect((error as TypegenError).message).toContain("namespace from API response");
      expect(await listFiles(root)).toEqual([]);
    });
  });

  const templates: Array<[label: string, template: string, ns: string, expectedFile: string]> = [
    [
      "the default template, default namespace at the root",
      DEFAULT_FILE_TEMPLATE,
      "default",
      "pt-BR.json",
    ],
    [
      "the default template, a nested namespace",
      DEFAULT_FILE_TEMPLATE,
      "common",
      "common/pt-BR.json",
    ],
    ["a locale-first template", "{languageTag}/{namespace}.json", "common", "pt-BR/common.json"],
    [
      "a flat template",
      "locale.{languageTag}.{namespace}.json",
      "common",
      "locale.pt-BR.common.json",
    ],
  ];

  it.each(templates)(
    "still writes a normal locale with %s",
    async (_label, template, namespace, expected) => {
      const root = await makeTempDir("comvi-cli-containment");
      const translationsPath = join(root, "locales");
      const sync = new TranslationSync({
        translationsPath,
        fileTemplate: template,
        format: "json",
      });

      const result = await sync.writeTranslations(responseFor("pt-BR", namespace));

      expect(result.filesWritten).toBe(1);
      expect(await listFiles(translationsPath)).toEqual([expected]);
      expect(sync.previewTranslations(responseFor("pt-BR", namespace)).files).toEqual([
        join(translationsPath, expected),
      ]);
    },
  );

  it("refuses a file template that climbs out of the translations directory", async () => {
    const root = await makeTempDir("comvi-cli-containment");
    const sync = new TranslationSync({
      translationsPath: join(root, "locales"),
      fileTemplate: "../{namespace}/{languageTag}.json",
      format: "json",
    });

    const error = await rejectionOf(sync.writeTranslations(responseFor("en", "common")));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(await listFiles(root)).toEqual([]);
  });

  it("refuses to write through a symlinked namespace directory that points outside", async () => {
    const root = await makeTempDir("comvi-cli-containment");
    const translationsPath = join(root, "locales");
    const outside = join(root, "outside");
    await fs.mkdir(translationsPath, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, join(translationsPath, "common"), "dir");

    const sync = new TranslationSync({
      translationsPath,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const error = await rejectionOf(sync.writeTranslations(responseFor("en", "common")));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(await listFiles(outside)).toEqual([]);
  });

  it("refuses to write through a symlinked translation file that points outside", async () => {
    const root = await makeTempDir("comvi-cli-containment");
    const translationsPath = join(root, "locales");
    const outside = join(root, "outside");
    await fs.mkdir(translationsPath, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(join(outside, "target.json"), "{}\n", "utf-8");
    await fs.symlink(join(outside, "target.json"), join(translationsPath, "en.json"), "file");

    const sync = new TranslationSync({
      translationsPath,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const error = await rejectionOf(sync.writeTranslations(responseFor("en", "default")));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(await fs.readFile(join(outside, "target.json"), "utf-8")).toBe("{}\n");
  });

  it("writes into a translations directory that is itself a symlink", async () => {
    const root = await makeTempDir("comvi-cli-containment");
    const real = join(root, "real-locales");
    const link = join(root, "locales");
    await fs.mkdir(real, { recursive: true });
    await fs.symlink(real, link, "dir");

    const sync = new TranslationSync({
      translationsPath: link,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    const result = await sync.writeTranslations(responseFor("en", "default"));

    expect(result.filesWritten).toBe(1);
    expect(await listFiles(real)).toEqual(["en.json"]);
  });
});
