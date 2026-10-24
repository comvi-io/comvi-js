import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { TranslationSync } from "../src/core/TranslationSync";
import { mergeMissing } from "../src/core/MissingMerge";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { detectJsonStyle } from "../src/utils/jsonStyle";
import { makeTempDir, removeTempDirs } from "./helpers";

/**
 * Both catalog writers keep the file's own layout, so a repository whose
 * formatter checks JSON (tabs, CRLF, no final newline) stays green after
 * `comvi translate` or `comvi pull`.
 */

const TABS = '{\n\t"a": "A"\n}\n';
const FOUR = '{\n    "a": "A"\n}\n';
const CRLF = '{\r\n  "a": "A"\r\n}\r\n';
const NO_FINAL_NEWLINE = '{\n  "a": "A"\n}';

describe("detectJsonStyle", () => {
  it.each([
    ["tabs", TABS, { indent: "\t", eol: "\n", finalNewline: true }],
    ["four spaces", FOUR, { indent: "    ", eol: "\n", finalNewline: true }],
    ["CRLF", CRLF, { indent: "  ", eol: "\r\n", finalNewline: true }],
    ["no final newline", NO_FINAL_NEWLINE, { indent: "  ", eol: "\n", finalNewline: false }],
    ["a one-line file", '{"a":"A"}\n', { eol: "\n", finalNewline: true }],
    ["a one-line file without a newline", '{"a":"A"}', {}],
    ["an empty file", "", {}],
    ["no file", null, {}],
    ["mixed tabs and spaces", '{\n\t  "a": "A"\n}\n', { eol: "\n", finalNewline: true }],
  ])("%s", (_name, text, style) => {
    expect(detectJsonStyle(text)).toEqual(style);
  });
});

describe("catalog writers keep the file's layout", () => {
  let dir: string;
  let sync: TranslationSync;

  beforeEach(async () => {
    dir = await makeTempDir("comvi-json-style");
    sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await removeTempDirs();
  });

  async function write(relativePath: string, text: string): Promise<void> {
    const filePath = join(dir, relativePath);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, text, "utf-8");
  }

  function read(relativePath: string): Promise<string> {
    return fs.readFile(join(dir, relativePath), "utf-8");
  }

  function translate(source: Record<string, string>, target: Record<string, string>) {
    return mergeMissing({
      sync,
      defaultNamespace: "main",
      sourceLocale: "en",
      source: { common: source },
      targets: { de: { common: target } },
    });
  }

  function pull(catalogs: Record<string, Record<string, string>>, sourceLocale?: string) {
    return sync.writeTranslations(
      {
        locales: Object.keys(catalogs),
        namespaces: ["common"],
        translations: Object.fromEntries(
          Object.entries(catalogs).map(([locale, catalog]) => [locale, { common: catalog }]),
        ),
      },
      { defaultNamespace: "main", sourceLocale },
    );
  }

  describe("translate", () => {
    it.each([
      ["tabs", TABS, '{\n\t"a": "A-de"\n}\n'],
      ["four spaces", FOUR, '{\n    "a": "A-de"\n}\n'],
      ["CRLF", CRLF, '{\r\n  "a": "A-de"\r\n}\r\n'],
      ["no final newline", NO_FINAL_NEWLINE, '{\n  "a": "A-de"\n}'],
    ])("keeps %s in an existing target", async (_name, layout, expected) => {
      await write("common/en.json", '{\n  "a": "A"\n}\n');
      await write("common/de.json", layout.replace('"A"', '""'));

      await translate({ a: "A" }, { a: "A-de" });

      expect(await read("common/de.json")).toBe(expected);
    });

    it("keeps tabs at every depth of a nested target", async () => {
      await write(
        "common/en.json",
        '{\n  "nav": {\n    "home": "Home",\n    "about": "About"\n  }\n}\n',
      );
      await write("common/de.json", '{\n\t"nav": {\n\t\t"home": "Start"\n\t}\n}\n');

      await translate(
        { "nav.home": "Home", "nav.about": "About" },
        { "nav.home": "Start", "nav.about": "Über" },
      );

      expect(await read("common/de.json")).toBe(
        '{\n\t"nav": {\n\t\t"home": "Start",\n\t\t"about": "Über"\n\t}\n}\n',
      );
    });

    it("gives a new target the source file's layout", async () => {
      await write("common/en.json", '{\r\n\t"a": "A"\r\n}');

      await translate({ a: "A" }, { a: "A-de" });

      expect(await read("common/de.json")).toBe('{\r\n\t"a": "A-de"\r\n}');
    });

    it("takes what a one-line target does not show from the source", async () => {
      await write("common/en.json", TABS);
      await write("common/de.json", "{}");

      await translate({ a: "A" }, { a: "A-de" });

      expect(await read("common/de.json")).toBe('{\n\t"a": "A-de"\n}\n');
    });

    it("falls back to two spaces and a final newline without a source file", async () => {
      await write("common/de.json", "{}\n");

      await translate({ a: "A" }, { a: "A-de" });

      expect(await read("common/de.json")).toBe('{\n  "a": "A-de"\n}\n');
    });
  });

  describe("pull", () => {
    it.each([
      ["tabs", TABS, '{\n\t"a": "A2"\n}\n'],
      ["four spaces", FOUR, '{\n    "a": "A2"\n}\n'],
      ["CRLF", CRLF, '{\r\n  "a": "A2"\r\n}\r\n'],
      ["no final newline", NO_FINAL_NEWLINE, '{\n  "a": "A2"\n}'],
    ])("keeps %s in an existing file", async (_name, layout, expected) => {
      await write("common/en.json", layout);

      await pull({ en: { a: "A2" } });

      expect(await read("common/en.json")).toBe(expected);
    });

    it("gives a new file the source locale's layout", async () => {
      await write("common/en.json", TABS);

      await pull({ en: { a: "A" }, de: { a: "A-de" } }, "en");

      expect(await read("common/de.json")).toBe('{\n\t"a": "A-de"\n}\n');
    });

    it("keeps the layout through --empty-dir, which clears the files first", async () => {
      await write("common/en.json", TABS);
      // A clear refuses a directory outside the working directory.
      vi.spyOn(process, "cwd").mockReturnValue(dirname(dir));

      await sync.replaceTranslations(
        {
          locales: ["en", "de"],
          namespaces: ["common"],
          translations: {
            en: { common: { a: "A" } },
            de: { common: { a: "A-de" } },
          },
        },
        { defaultNamespace: "main" },
        { defaultNamespace: "main", sourceLocale: "en" },
      );

      expect(await read("common/en.json")).toBe('{\n\t"a": "A"\n}\n');
      expect(await read("common/de.json")).toBe('{\n\t"a": "A-de"\n}\n');
    });

    it("falls back to two spaces and a final newline for a new file without a source", async () => {
      await write("common/en.json", TABS);

      await pull({ de: { a: "A-de" } });

      expect(await read("common/de.json")).toBe('{\n  "a": "A-de"\n}\n');
    });
  });
});
