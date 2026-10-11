import { promises as fs } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { TranslationSync } from "../src/core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { makeTempDir, removeTempDirs } from "./helpers";

/**
 * Locale and namespace names index the translations map, and they arrive from
 * the TMS response and from local file names. `__proto__`, `constructor` and
 * `prototype` must land as ordinary entries instead of reaching — or
 * replacing — a prototype that every other object in the process shares.
 */

const API_BASE_URL = "https://api.test.com";

/** JSON.parse, so `__proto__` is an OWN key of the fixture and not its prototype. */
function parseJson(text: string): unknown {
  return JSON.parse(text);
}

/** Global state a polluting write would leave behind, cleared between tests. */
const POLLUTED_KEYS = ["default", "common", "en", "hello"] as const;

function clearPollution(): void {
  for (const key of POLLUTED_KEYS) {
    delete (Object.prototype as Record<string, unknown>)[key];
    delete (Object as unknown as Record<string, unknown>)[key];
    delete (Object.prototype.constructor as unknown as Record<string, unknown>)[key];
  }
}

function assertGlobalsClean(): void {
  const probe = {} as Record<string, unknown>;
  for (const key of POLLUTED_KEYS) {
    expect(probe[key]).toBeUndefined();
    expect((Object as unknown as Record<string, unknown>)[key]).toBeUndefined();
  }
}

describe("prototype pollution through locale and namespace names", () => {
  beforeEach(clearPollution);

  afterEach(async () => {
    clearPollution();
    await removeTempDirs();
  });

  describe("the translations response", () => {
    function stubTranslations(body: unknown): ApiClient {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as Response),
      );
      return new ApiClient({ apiKey: "test-key", apiBaseUrl: API_BASE_URL });
    }

    it("keeps a __proto__ locale out of Object.prototype", async () => {
      const client = stubTranslations(
        parseJson('{"locales":["__proto__"],"namespaces":{"default":{"__proto__":{"a":"A"}}}}'),
      );

      const result = await client.fetchTranslations();

      assertGlobalsClean();
      expect(Object.getPrototypeOf(result.translations)).toBeNull();
      expect(Object.keys(result.translations)).toEqual(["__proto__"]);
      expect(Object.getOwnPropertyDescriptor(result.translations, "__proto__")?.value).toEqual({
        default: { a: "A" },
      });
    });

    it("keeps a constructor locale off the Object constructor", async () => {
      const client = stubTranslations(
        parseJson('{"locales":["constructor"],"namespaces":{"default":{"constructor":{"a":"A"}}}}'),
      );

      const result = await client.fetchTranslations();

      assertGlobalsClean();
      expect(Object.keys(result.translations)).toEqual(["constructor"]);
      expect(result.translations.constructor).toEqual({ default: { a: "A" } });
    });

    it("keeps a __proto__ namespace from replacing the locale map's prototype", async () => {
      const client = stubTranslations(
        parseJson('{"locales":["en"],"namespaces":{"__proto__":{"en":{"hello":"Polluted"}}}}'),
      );

      const result = await client.fetchTranslations();

      assertGlobalsClean();
      expect(Object.getPrototypeOf(result.translations.en)).toBeNull();
      expect(Object.keys(result.translations.en)).toEqual(["__proto__"]);
      expect(result.namespaces).toEqual(["__proto__"]);
    });

    it("keeps a prototype namespace as an ordinary entry", async () => {
      const client = stubTranslations(
        parseJson('{"locales":["en"],"namespaces":{"prototype":{"en":{"a":"A"}}}}'),
      );

      const result = await client.fetchTranslations();

      assertGlobalsClean();
      expect(Object.keys(result.translations.en)).toEqual(["prototype"]);
      expect(result.translations.en.prototype).toEqual({ a: "A" });
    });

    it("reads only own keys of the response maps", async () => {
      const namespaces = Object.create({ inherited: { en: { a: "A" } } }) as Record<
        string,
        Record<string, Record<string, string>>
      >;
      namespaces.common = { en: { a: "A" } };
      const client = stubTranslations({ locales: ["en"], namespaces });

      const result = await client.fetchTranslations();

      expect(result.namespaces).toEqual(["common"]);
      expect(Object.keys(result.translations.en)).toEqual(["common"]);
    });
  });

  describe("local translation files", () => {
    it("keeps a __proto__ locale file out of Object.prototype", async () => {
      const dir = await makeTempDir("comvi-cli-pollution");
      await fs.writeFile(join(dir, "__proto__.json"), '{"hello":"Polluted"}\n', "utf-8");
      const sync = new TranslationSync({
        translationsPath: dir,
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const result = await sync.readTranslations();

      assertGlobalsClean();
      expect(Object.getPrototypeOf(result.translations)).toBeNull();
      expect(Object.keys(result.translations)).toEqual(["__proto__"]);
      expect(Object.getOwnPropertyDescriptor(result.translations, "__proto__")?.value).toEqual({
        default: { hello: "Polluted" },
      });
    });

    it("keeps a __proto__ namespace directory from replacing the locale map's prototype", async () => {
      const dir = await makeTempDir("comvi-cli-pollution");
      await fs.mkdir(join(dir, "__proto__"), { recursive: true });
      await fs.writeFile(join(dir, "__proto__", "en.json"), '{"hello":"Polluted"}\n', "utf-8");
      const sync = new TranslationSync({
        translationsPath: dir,
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const result = await sync.readTranslations();

      assertGlobalsClean();
      expect(Object.getPrototypeOf(result.translations.en)).toBeNull();
      expect(Object.keys(result.translations.en)).toEqual(["__proto__"]);
    });

    it("keeps a constructor locale file off the Object constructor", async () => {
      const dir = await makeTempDir("comvi-cli-pollution");
      await fs.writeFile(join(dir, "constructor.json"), '{"hello":"Polluted"}\n', "utf-8");
      const sync = new TranslationSync({
        translationsPath: dir,
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const result = await sync.readTranslations();

      assertGlobalsClean();
      expect(Object.keys(result.translations)).toEqual(["constructor"]);
      expect(result.translations.constructor).toEqual({
        default: { hello: "Polluted" },
      });
    });
  });

  describe("the write path", () => {
    it("refuses a __proto__ locale from the response before writing", async () => {
      const dir = await makeTempDir("comvi-cli-pollution");
      const sync = new TranslationSync({
        translationsPath: join(dir, "locales"),
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      await expect(
        sync.writeTranslations({
          locales: ["__proto__"],
          namespaces: ["default"],
          translations: parseJson('{"__proto__":{"default":{"a":"A"}}}') as never,
        }),
      ).rejects.toThrow(/locale from API response/);
    });

    it("writes a constructor namespace as an ordinary directory", async () => {
      const dir = await makeTempDir("comvi-cli-pollution");
      const translationsPath = join(dir, "locales");
      const sync = new TranslationSync({
        translationsPath,
        fileTemplate: DEFAULT_FILE_TEMPLATE,
        format: "json",
      });

      const result = await sync.writeTranslations({
        locales: ["en"],
        namespaces: ["constructor"],
        translations: { en: { constructor: { a: "A" } } },
      });

      expect(result.filesWritten).toBe(1);
      expect(
        JSON.parse(await fs.readFile(join(translationsPath, "constructor", "en.json"), "utf-8")),
      ).toEqual({
        a: "A",
      });
    });
  });
});

/**
 * The innermost level of a remote response is the raw `JSON.parse` object, so
 * a local key named after something on `Object.prototype` used to find an
 * inherited function where the remote catalog has no such key at all:
 * `--force-mode abort` failed a clean push, and `keep` reported the wrong
 * skipped count. Local files already flatten into a null-prototype map.
 */
describe("inherited keys in the catalog level", () => {
  const INHERITED_NAMES = ["constructor", "toString", "valueOf", "hasOwnProperty"] as const;

  /** Own keys named after inherited members, each new to the remote catalog. */
  function localCatalog(): Record<string, string> {
    const catalog: Record<string, string> = {};
    for (const name of INHERITED_NAMES) {
      catalog[name] = "Local";
    }
    return catalog;
  }

  const PROJECT = {
    id: 123,
    organizationId: 1,
    name: "Test Project",
    description: null,
    sourceLocale: "en",
  };

  const COMMIT_OK = {
    success: true,
    stats: {
      keysCreated: 4,
      keysUpdated: 0,
      keysDeleted: 0,
      translationsCreated: 4,
      translationsUpdated: 0,
      namespacesCreated: [],
    },
  };

  /** The remote has one ordinary key and none of the four names. */
  const REMOTE = { locales: ["en"], namespaces: { common: { en: { greeting: "Remote" } } } };

  function stubPush(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      // `/v1/projects/123/import/commit` contains `/v1/project`, so it goes first.
      const body = url.includes("/import/commit")
        ? COMMIT_OK
        : url.includes("/v1/translations")
          ? REMOTE
          : url.includes("/v1/project")
            ? PROJECT
            : undefined;

      if (!body) throw new Error(`unexpected request: ${url}`);
      return { ok: true, status: 200, json: async () => body } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock as unknown as ReturnType<typeof vi.fn>;
  }

  it.each(["abort", "keep", "override"] as const)(
    "counts no conflict for inherited names in %s mode",
    async (forceMode) => {
      stubPush();
      const client = new ApiClient({ apiKey: "test-key", apiBaseUrl: API_BASE_URL });

      const result = await client.pushTranslations({
        translations: { en: { common: localCatalog() } },
        forceMode,
      });

      expect(result).toEqual({ created: 4, updated: 0, skipped: 0 });
    },
  );

  it("still counts a real conflict on an inherited name", async () => {
    stubPush();
    const client = new ApiClient({ apiKey: "test-key", apiBaseUrl: API_BASE_URL });

    const result = await client.pushTranslations({
      translations: { en: { common: { greeting: "Local" } } },
      forceMode: "keep",
    });

    expect(result.skipped).toBe(1);
  });

  describe("compareTranslations", () => {
    const sync = new TranslationSync({
      translationsPath: "src/locales",
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });

    it("reports inherited names missing from the remote as created", () => {
      const diff = sync.compareTranslations(
        { en: { common: localCatalog() } },
        { en: { common: { greeting: "Remote" } } },
      );

      expect(diff).toEqual({ created: 4, updated: 0, conflicts: 0, deleted: 1 });
    });

    it("reports inherited names missing from the local catalog as deleted", () => {
      const diff = sync.compareTranslations(
        { en: { common: { greeting: "Local" } } },
        { en: { common: localCatalog() } },
      );

      expect(diff).toEqual({ created: 1, updated: 0, conflicts: 0, deleted: 4 });
    });
  });
});
