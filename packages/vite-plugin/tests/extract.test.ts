import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractSchema, type ProjectSchema } from "../src/extract";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("extractSchema", () => {
  describe("file-per-namespace structure", () => {
    /**
     * Called from each test rather than a `beforeAll`: work a hook does is not
     * attributed to any test, which hides the lines it exercises from
     * per-test coverage (and from `pnpm mutation`).
     */
    const perNamespaceSchema = (): Promise<ProjectSchema> =>
      extractSchema({
        translationsPath: path.join(FIXTURES, "per-namespace"),
        fileTemplate: "{languageTag}/{namespace}.json",
      });

    it("should extract keys with namespace prefix", async () => {
      const schema = await perNamespaceSchema();

      expect(Object.keys(schema.keys).sort()).toEqual([
        "admin:dashboard",
        "common:greeting",
        "common:info",
        "common:items",
        "common:logout",
        "common:nav.about",
        "common:nav.home",
      ]);
    });

    it("should extract params from {name} syntax", async () => {
      const schema = await perNamespaceSchema();

      expect(schema.keys["common:greeting"]).toEqual({
        params: [{ name: "name", type: "string" }],
      });
      expect(schema.keys["common:logout"]).toEqual({ params: [] });
    });

    it("should extract plural params as number", async () => {
      const schema = await perNamespaceSchema();

      expect(schema.keys["common:items"]).toEqual({
        params: [{ name: "count", type: "number" }],
      });
    });

    it("should flatten nested keys to dot notation", async () => {
      const schema = await perNamespaceSchema();

      expect(schema.keys["common:nav.home"]).toEqual({ params: [] });
      expect(schema.keys["common:nav.about"]).toEqual({ params: [] });
    });

    it("should merge params across languages", async () => {
      const schema = await perNamespaceSchema();

      // "info" carries {name} in en and adds {count, plural} in fr
      expect(schema.keys["common:info"]).toEqual({
        params: [
          { name: "name", type: "string" },
          { name: "count", type: "number" },
        ],
      });
    });
  });

  describe("single-file-per-language structure", () => {
    it("should use 'default' namespace for flat files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "single-file"),
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["default:greeting", "default:nested.key"]);
    });

    it("should use the v0.3 default layout for root default and namespace directories", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "mixed-layout"),
        defaultNs: "common",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["admin:dashboard", "common:greeting"]);
      expect(schema.keys["common:greeting"]).toEqual({
        params: [{ name: "name", type: "string" }],
      });
    });

    it("should use custom defaultNs for unmatched root-level files", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "mixed-layout"),
        fileTemplate: "{namespace}/{languageTag}.json",
        defaultNs: "common",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["admin:dashboard", "common:greeting"]);
    });
  });

  describe("template without {namespace}", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
      await Promise.all(
        tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
      );
    });

    async function makeDir(files: Record<string, string>): Promise<string> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-extract-"));
      tempDirs.push(dir);
      for (const [file, content] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await fs.writeFile(path.join(dir, file), content, "utf-8");
      }
      return dir;
    }

    it("{languageTag}.json → keys land in the default namespace", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "single-file"),
        fileTemplate: "{languageTag}.json",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["default:greeting", "default:nested.key"]);
    });

    it("{languageTag}.json with defaultNs → keys land in that namespace", async () => {
      const schema = await extractSchema({
        translationsPath: path.join(FIXTURES, "single-file"),
        fileTemplate: "{languageTag}.json",
        defaultNs: "common",
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["common:greeting", "common:nested.key"]);
    });

    it("{languageTag}/messages.json → keys land in the default namespace", async () => {
      const dir = await makeDir({
        "en/messages.json": '{ "hello": "Hello {name}" }',
        "de/messages.json": '{ "hello": "Hallo {name}" }',
      });

      const schema = await extractSchema({
        translationsPath: dir,
        fileTemplate: "{languageTag}/messages.json",
      });

      expect(schema.keys).toEqual({
        "default:hello": { params: [{ name: "name", type: "string" }] },
      });
    });
  });

  describe("error and empty inputs", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
      await Promise.all(
        tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
      );
    });

    async function makeDir(): Promise<string> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-extract-"));
      tempDirs.push(dir);
      return dir;
    }

    it("returns an empty schema for a directory with no JSON files", async () => {
      const dir = await makeDir();

      await expect(extractSchema({ translationsPath: dir })).resolves.toEqual({ keys: {} });
    });

    it("rejects when a translation file contains invalid JSON", async () => {
      const dir = await makeDir();
      await fs.writeFile(path.join(dir, "en.json"), "{ invalid json", "utf-8");

      await expect(extractSchema({ translationsPath: dir })).rejects.toThrow(SyntaxError);
    });

    it("rejects when the translations directory does not exist", async () => {
      const dir = await makeDir();

      await expect(extractSchema({ translationsPath: path.join(dir, "missing") })).rejects.toThrow(
        /ENOENT/,
      );
    });
  });
  /**
   * The argument type decides the emitted TypeScript type, so every ICU form
   * the extractor recognises — and one it does not — is pinned here.
   */
  describe("parameter typing", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
      await Promise.all(
        tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
      );
    });

    async function makeTempDir(): Promise<string> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-extract-params-"));
      tempDirs.push(dir);
      return dir;
    }

    /** One root-level `en.json`, read with the default layout as `default:<key>`. */
    async function schemaFor(catalog: Record<string, unknown>): Promise<ProjectSchema> {
      const dir = await makeTempDir();
      await fs.writeFile(path.join(dir, "en.json"), JSON.stringify(catalog), "utf-8");
      return extractSchema({ translationsPath: dir });
    }

    it.each([
      {
        form: "a bare placeholder",
        value: "Hi {name}",
        params: [{ name: "name", type: "string" }],
      },
      {
        form: "a plural",
        value: "{count, plural, one {# item} other {# items}}",
        params: [{ name: "count", type: "number" }],
      },
      {
        form: "a selectordinal",
        value: "{place, selectordinal, other {#th}}",
        params: [{ name: "place", type: "number" }],
      },
      // `@comvi/core` implements no `number`, `date` or `time` argument type:
      // it raises E_ICU_SYNTAX, and the ingestion preflight refuses the key. A
      // generated parameter would demand an argument at a call that throws.
      { form: "a number, which core does not implement", value: "{total, number}", params: [] },
      {
        form: "a number with a style",
        value: "{total, number, percent}",
        params: [],
      },
      { form: "a date", value: "{when, date, short}", params: [] },
      { form: "a time", value: "{at, time}", params: [] },
      { form: "a time with a style", value: "{at, time, short}", params: [] },
      {
        form: "a type that merely starts with one core implements",
        value: "{n, pluralx, other {a}}",
        params: [],
      },
      {
        form: "a plural with no choice list",
        value: "{count, plural}",
        params: [],
      },
      {
        form: "a choice list whose selector has no sub-message",
        value: "{count, plural, other}",
        params: [],
      },
      {
        form: "an unsupported argument beside a good one",
        value: "Hi {name} and {total, number}",
        params: [],
      },
      {
        form: "a select",
        value: "{gender, select, male {he} other {they}}",
        params: [{ name: "gender", type: "string" }],
      },
      { form: "an argument type core does not know", value: "{x, wobble, other {a}}", params: [] },
      {
        form: "a plural whose branches are words",
        value: "{count, plural, one {item} other {items}}",
        params: [{ name: "count", type: "number" }],
      },
      {
        form: "a placeholder nested inside a branch",
        value: "{count, plural, other {# of {total}}}",
        params: [
          { name: "count", type: "number" },
          { name: "total", type: "string" },
        ],
      },
      {
        form: "whitespace before the closing brace",
        value: "Hi {name }",
        params: [{ name: "name", type: "string" }],
      },
      {
        form: "a brace that opens no placeholder",
        // Nothing closes the first `{`, so core treats the rest of the message
        // as literal text and the `{name}` after it is not a placeholder.
        value: "a { b {name}",
        params: [],
      },
      {
        form: "a name used again after a typed use",
        value: "{count, plural, other {#}} of {count}",
        params: [{ name: "count", type: "number" }],
      },
      {
        form: "a name given a second argument type",
        value: "{count, plural, other {#}} {count, select, other {x}}",
        params: [{ name: "count", type: "number" }],
      },
      // A group with no comma is a parameter whose name is its trimmed
      // contents, whatever that looks like — core's compiler does the same.
      {
        form: "a name followed by other text",
        value: "{name x}",
        params: [{ name: "name x", type: "string" }],
      },
      {
        form: "a name padded with spaces",
        value: "{ spaced }",
        params: [{ name: "spaced", type: "string" }],
      },
      { form: "a numeric name", value: "{0} items", params: [{ name: "0", type: "string" }] },
      {
        form: "an unclosed brace before a real placeholder",
        value: "{name and {other}",
        params: [],
      },
    ])("types $form", async ({ value, params }) => {
      const schema = await schemaFor({ message: value });

      expect(schema.keys["default:message"]).toEqual({ params });
    });

    /**
     * ICU DOUBLE_OPTIONAL quoting, the same rule `@comvi/core`'s message parser
     * applies at runtime (packages/core/src/core/translate/parser.ts): an
     * apostrophe opens quoted literal text only when it immediately precedes a
     * syntax character — `{`, `}`, or `#` inside a plural sub-message — and
     * `''` is always one literal apostrophe. The extracted parameter set has to
     * equal what the runtime substitutes, or the generated types demand an
     * argument no message consumes.
     */
    describe("ICU apostrophe quoting", () => {
      it.each([
        { form: "a quoted placeholder", value: "'{name}' stays literal", params: [] },
        {
          form: "a quoted placeholder beside a real one",
          value: "'{name}' but {real}",
          params: [{ name: "real", type: "string" }],
        },
        {
          form: "a doubled apostrophe before a placeholder",
          value: "It''s {name}",
          params: [{ name: "name", type: "string" }],
        },
        {
          form: "a doubled apostrophe wrapping a placeholder",
          value: "''{name}''",
          params: [{ name: "name", type: "string" }],
        },
        {
          form: "a lone apostrophe in ordinary prose",
          value: "Superiors' behavior for {name}",
          params: [{ name: "name", type: "string" }],
        },
        {
          form: "a quoted closing brace",
          value: "'}' closes nothing, {name} does",
          params: [{ name: "name", type: "string" }],
        },
        {
          form: "a quoted placeholder inside a plural branch",
          value: "{count, plural, other {'{total}' items}}",
          params: [{ name: "count", type: "number" }],
        },
        {
          form: "a quoted hash beside a real placeholder in a plural branch",
          value: "{count, plural, other {'#' of {total}}}",
          params: [
            { name: "count", type: "number" },
            { name: "total", type: "string" },
          ],
        },
        {
          form: "a quoted brace that must not close the plural branch",
          value: "{count, plural, other {'}' {total}}}",
          params: [
            { name: "count", type: "number" },
            { name: "total", type: "string" },
          ],
        },
        {
          form: "a quoted placeholder inside a select branch",
          value: "{gender, select, other {'{x}'}}",
          params: [{ name: "gender", type: "string" }],
        },
        {
          form: "an apostrophe before a hash at the top level, where # is text",
          value: "'#' {n}",
          params: [{ name: "n", type: "string" }],
        },
        { form: "a quote that is never closed", value: "'{name} and {other}", params: [] },
      ])("reads $form the way the runtime does", async ({ value, params }) => {
        const schema = await schemaFor({ message: value });

        expect(schema.keys["default:message"]).toEqual({ params });
      });
    });

    it("skips leaves that are not strings", async () => {
      const schema = await schemaFor({
        greeting: "Hello",
        count: 42,
        tags: ["a"],
        nothing: null,
        nested: { deep: "x" },
      });

      expect(Object.keys(schema.keys).sort()).toEqual(["default:greeting", "default:nested.deep"]);
    });

    it("ignores files that are not JSON", async () => {
      const dir = await makeTempDir();
      await fs.writeFile(path.join(dir, "en.json"), '{ "greeting": "Hello" }', "utf-8");
      await fs.writeFile(path.join(dir, "notes.txt"), "not json at all", "utf-8");

      await expect(extractSchema({ translationsPath: dir })).resolves.toEqual({
        keys: { "default:greeting": { params: [] } },
      });
    });

    /**
     * Merging is symmetric — "number wins" and a new name is added — so these
     * assert the union without depending on the order the directory is read in.
     */
    const A_CATALOG = '{ "info": "{shared1} {shared2, plural, other {#}} {onlyA}" }';
    const B_CATALOG = '{ "info": "{shared1, plural, other {#}} {shared2} {onlyB}" }';
    const MERGED = [
      { name: "shared1", type: "number" },
      { name: "shared2", type: "number" },
      { name: "onlyA", type: "string" },
      { name: "onlyB", type: "string" },
    ];

    it("merges params for one key across default-namespace files", async () => {
      const dir = await makeTempDir();
      await fs.writeFile(path.join(dir, "en.json"), A_CATALOG, "utf-8");
      await fs.writeFile(path.join(dir, "fr.json"), B_CATALOG, "utf-8");

      const schema = await extractSchema({ translationsPath: dir });

      expect(schema.keys["default:info"].params).toHaveLength(4);
      expect(schema.keys["default:info"].params).toEqual(expect.arrayContaining(MERGED));
    });

    it("merges params for one key across files the template matched", async () => {
      const dir = await makeTempDir();
      await fs.mkdir(path.join(dir, "common"), { recursive: true });
      await fs.writeFile(path.join(dir, "common", "en.json"), A_CATALOG, "utf-8");
      await fs.writeFile(path.join(dir, "common", "fr.json"), B_CATALOG, "utf-8");

      const schema = await extractSchema({ translationsPath: dir });

      expect(schema.keys["common:info"].params).toHaveLength(4);
      expect(schema.keys["common:info"].params).toEqual(expect.arrayContaining(MERGED));
    });
  });
});

/**
 * A translation key named `__proto__` is legal JSON and a legal catalog key.
 * Flattening into `{}` used to hit Object.prototype's setter and drop it
 * silently; `constructor` and `prototype` must stay ordinary keys too.
 */
describe("extractSchema with object-member key names", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function schemaFor(files: Record<string, string>): Promise<ProjectSchema> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-extract-proto-"));
    roots.push(root);
    for (const [file, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), content, "utf-8");
    }
    return extractSchema({ translationsPath: root });
  }

  // Raw JSON text: JSON.parse makes `__proto__` an own key, as a real file does.
  const catalog =
    '{"__proto__":"lost {name}","constructor":"c","prototype":"p","ok":"kept",' +
    '"nested":{"__proto__":"n","constructor":"nc","prototype":"np"}}';

  const expectedKeys = (ns: string) =>
    [
      `${ns}:__proto__`,
      `${ns}:constructor`,
      `${ns}:nested.__proto__`,
      `${ns}:nested.constructor`,
      `${ns}:nested.prototype`,
      `${ns}:ok`,
      `${ns}:prototype`,
    ].sort();

  it("keeps them in a root default-namespace file", async () => {
    const schema = await schemaFor({ "en.json": catalog });

    expect(Object.keys(schema.keys).sort()).toEqual(expectedKeys("default"));
    expect(Object.getOwnPropertyDescriptor(schema.keys, "default:__proto__")?.value).toEqual({
      params: [{ name: "name", type: "string" }],
    });
  });

  it("keeps them in a namespace file", async () => {
    const schema = await schemaFor({ "admin/en.json": catalog });

    expect(Object.keys(schema.keys).sort()).toEqual(expectedKeys("admin"));
  });

  it("leaves Object.prototype untouched", async () => {
    await schemaFor({ "en.json": catalog });

    expect(Object.prototype).not.toHaveProperty("nested");
    expect(({} as Record<string, unknown>).ok).toBeUndefined();
  });
});
