import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { useTranslations } from "../src/composables/useTranslations";
import type { Language } from "../src/types";

const addMessagesMock = vi.fn();

vi.mock("../src/Core", () => ({
  getI18nInstance: () => ({ addMessages: addMessagesMock }),
}));

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

const LANGUAGES: Language[] = [
  {
    id: 1,
    code: "en",
    name: "English",
    nativeName: "English",
    pluralForms: ["one", "other"],
    isSource: true,
  },
  {
    id: 2,
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    pluralForms: ["one", "other"],
    isSource: false,
  },
];

const EN_PLURAL = "{count, plural, one {# file} other {# files}}";
const EN_EDITED = "{count, plural, one {# document} other {# files}}";

function keyResponse(values: Record<string, string>, isPlural = true) {
  return {
    id: 1,
    key: "files.count",
    namespaceId: 10,
    isPlural,
    namespace: "default",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    translations: Object.fromEntries(
      Object.entries(values).map(([lang, value]) => [
        lang,
        {
          id: 11,
          value,
          status: "not_reviewed",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
          createdBy: 1,
          reviewedBy: 1,
        },
      ]),
    ),
  };
}

function ok(payload: unknown): Response {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
}

/** GET answers `values`; PUT merges what was sent and answers the whole key, as the API does. */
function serveKey(values: Record<string, string>, isPlural = true) {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        isPlural: boolean;
        translations: Record<string, { value: string }>;
      };
      return ok(
        keyResponse(
          {
            ...values,
            ...Object.fromEntries(Object.entries(body.translations).map(([l, t]) => [l, t.value])),
          },
          body.isPlural,
        ),
      );
    }
    return ok(keyResponse(values, isPlural));
  });
  return fetchMock;
}

function sentTranslations(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  return JSON.parse(String(put?.[1]?.body)).translations as Record<string, { value: string }>;
}

async function loadKey() {
  const manager = useTranslations(ref(LANGUAGES));
  await manager.loadTranslation("files.count", "default");
  return manager;
}

describe("saving one language leaves ICU the editor cannot rebuild untouched", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    addMessagesMock.mockReset();
  });

  afterEach(() => {
    resetApiConfig();
  });

  it.each([
    ["an exact selector", "{count, plural, =0 {None} one {One} other {# items}}"],
    ["an offset", "{count, plural, offset:1 one {You and one other} other {You and # others}}"],
    [
      "a select nested in a plural",
      "{count, plural, one {{gender, select, male {He has one} other {They have one}}} other {{gender, select, male {He has #} other {They have #}}}}",
    ],
    [
      "a plural with an exact selector nested in a select",
      "{gender, select, male {{count, plural, =0 {He has none} other {He has #}}} other {{count, plural, =0 {They have none} other {They have #}}}}",
    ],
    ["a multiline plural", "{count, plural,\n  one {# Datei}\n  other {# Dateien}\n}"],
    ["surrounding text", "Sie haben {count, plural, one {# Datei} other {# Dateien}}."],
    ["a different plural variable", "{n, plural, one {# Datei} other {# Dateien}}"],
    ["plain text under a plural key", "Dateien"],
    [
      "a select-only message under a plural key",
      "{formality, select, formal {Ihre Dateien} other {Deine Dateien}}",
    ],
  ])("leaves a German value with %s unsent and unchanged", async (_case, german) => {
    const fetchMock = serveKey({ en: EN_PLURAL, de: german });
    const manager = await loadKey();

    manager.updateTranslation("en", "one", "# document");
    const saved = await manager.saveTranslation();

    expect(saved).not.toBeNull();
    expect(sentTranslations(fetchMock)).toEqual({
      en: { value: EN_EDITED, status: "not_reviewed" },
    });
    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": { "files.count": EN_EDITED },
      "de:default": { "files.count": german },
    });
  });

  it("offers a message it cannot rebuild as one plain-text value", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    expect(manager.isRawLanguage("de")).toBe(true);
    expect(manager.isRawLanguage("en")).toBe(false);
    expect(manager.translations.value.de).toEqual({ other: exact });
  });

  it("sends an edit to such a message as typed, never wrapped in a generated plural", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    const edited = "{count, plural, =0 {Keine} one {Eine} other {# Dateien}}";
    const fetchMock = serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    manager.updateTranslation("de", "other", edited);
    await manager.saveTranslation();

    expect(sentTranslations(fetchMock).de).toEqual({ value: edited, status: "not_reviewed" });
    expect(sentTranslations(fetchMock)).not.toHaveProperty("en");
  });

  it("keeps such a message as it is when plural mode is switched off and on", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    const fetchMock = serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    manager.togglePluralMode(false);
    manager.togglePluralMode(true);
    manager.toggleSelectMode("de", true);
    await manager.saveTranslation();

    expect(sentTranslations(fetchMock)).not.toHaveProperty("de");
    expect(manager.translations.value.de).toEqual({ other: exact });
  });
});

describe("a save leaves the review status of unchanged values alone", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    addMessagesMock.mockReset();
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("plural mode switched off → a message the editor cannot rebuild is not sent", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    const fetchMock = serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    manager.togglePluralMode(false);
    await manager.saveTranslation();

    expect(sentTranslations(fetchMock)).toEqual({
      en: { value: "# files", status: "not_reviewed" },
    });
  });

  it("variant settings touched without changing the value → the language is not sent", async () => {
    const fetchMock = serveKey({ en: "Files", de: "Dateien" }, false);
    const manager = await loadKey();

    manager.updateSelectConfig("de", { variable: "gender" });
    manager.updateTranslation("en", "other", "Documents");
    await manager.saveTranslation();

    expect(sentTranslations(fetchMock)).toEqual({
      en: { value: "Documents", status: "not_reviewed" },
    });
  });
  it("plural variable renamed → a message the editor cannot rebuild is not sent", async () => {
    const exact = "{count, plural, =0 {Keine} one {Eine} other {# Dateien}}";
    const fetchMock = serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    manager.updatePluralVariable("n");
    await manager.saveTranslation();

    expect(Object.keys(sentTranslations(fetchMock))).toEqual(["en"]);
  });

  it("variants switched on and off again → the language is not sent", async () => {
    const fetchMock = serveKey({ en: "Files", de: "Hallo" }, false);
    const manager = await loadKey();

    manager.toggleSelectMode("de", true, { variable: "gender", options: ["male", "other"] });
    manager.toggleSelectMode("de", false);
    manager.updateTranslation("en", "other", "Documents");
    await manager.saveTranslation();

    expect(Object.keys(sentTranslations(fetchMock))).toEqual(["en"]);
  });

  it("two saves in a row → each sends only the language edited since the last one", async () => {
    let stored: Record<string, string> = { en: "Files", de: "Dateien", fr: "Fichiers" };
    const bodies: Record<string, { value: string }>[] = [];
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          translations: Record<string, { value: string }>;
        };
        bodies.push(body.translations);
        stored = {
          ...stored,
          ...Object.fromEntries(Object.entries(body.translations).map(([l, t]) => [l, t.value])),
        };
      }
      return ok(keyResponse(stored, false));
    });
    const manager = await loadKey();

    manager.updateTranslation("de", "other", "Dokumente");
    await manager.saveTranslation();
    manager.updateTranslation("fr", "other", "Documents");
    await manager.saveTranslation();

    expect(bodies).toEqual([
      { de: { value: "Dokumente", status: "not_reviewed" } },
      { fr: { value: "Documents", status: "not_reviewed" } },
    ]);
    expect(manager.hasUnsavedChanges.value).toBe(false);
  });
});

function putCount(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").length;
}

describe("a save with nothing to write sends no request", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    addMessagesMock.mockReset();
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("an edit typed and reverted → no request, the plural flag on the server is left alone", async () => {
    const fetchMock = serveKey({
      en: EN_PLURAL,
      de: "{count, plural, one {# Datei} other {# Dateien}}",
    });
    const manager = await loadKey();
    const loaded = manager.state.value.data;

    manager.updateTranslation("en", "one", "# document");
    manager.updateTranslation("en", "one", "# file");
    expect(manager.hasUnsavedChanges.value).toBe(true);
    const saved = await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(0);
    expect(saved).toBe(loaded);
    expect(manager.state.value.data).toBe(loaded);
    expect(manager.hasUnsavedChanges.value).toBe(false);
    expect(manager.state.value.error).toBeNull();
    expect(addMessagesMock).not.toHaveBeenCalled();
  });

  it("variants switched on and off on the only language → no request", async () => {
    const fetchMock = serveKey({ en: "Files" }, false);
    const manager = await loadKey();

    manager.toggleSelectMode("en", true, { variable: "gender", options: ["male", "other"] });
    manager.toggleSelectMode("en", false);
    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(0);
    expect(manager.hasUnsavedChanges.value).toBe(false);
  });

  it("plural mode switched off with nothing rebuilt → the flag change is still sent", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    const fetchMock = serveKey({ de: exact });
    const manager = await loadKey();

    manager.togglePluralMode(false);
    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(1);
    expect(
      JSON.parse(String(fetchMock.mock.calls.find(([, i]) => i?.method === "PUT")?.[1]?.body)),
    ).toMatchObject({ isPlural: false, translations: {} });
  });

  it("plural switched on and off again → no request", async () => {
    const fetchMock = serveKey({ en: "Files", de: "Dateien" }, false);
    const manager = await loadKey();

    manager.togglePluralMode(true);
    manager.togglePluralMode(false);
    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(0);
    expect(manager.hasUnsavedChanges.value).toBe(false);
  });

  it("a value typed into a language the key has none for and cleared again → no request", async () => {
    const fetchMock = serveKey({ en: "Files" }, false);
    const manager = await loadKey();

    manager.updateTranslation("de", "other", "Dateien");
    manager.updateTranslation("de", "other", "");
    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(0);
  });

  it("on a plural key, a value typed into a new language and cleared again → no request", async () => {
    const fetchMock = serveKey({ en: EN_PLURAL });
    const manager = await loadKey();

    manager.updateTranslation("de", "one", "# Datei");
    manager.updateTranslation("de", "one", "");
    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(0);
  });

  it("a key the server does not have yet → the save still creates it", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "PUT"
        ? ok(keyResponse({}, false))
        : ({ ok: false, status: 404, statusText: "Not Found" } as Response),
    );
    const manager = await loadKey();

    await manager.saveTranslation();

    expect(putCount(fetchMock)).toBe(1);
  });

  it("an edit made while such a save settles → still unsaved, and the next save sends it", async () => {
    const fetchMock = serveKey({ en: "Files" }, false);
    const manager = await loadKey();

    manager.updateTranslation("en", "other", "Documents");
    manager.updateTranslation("en", "other", "Files");
    const pending = manager.saveTranslation();
    manager.updateTranslation("en", "other", "Documents");
    await pending;

    expect(manager.hasUnsavedChanges.value).toBe(true);
    await manager.saveTranslation();
    expect(sentTranslations(fetchMock)).toEqual({
      en: { value: "Documents", status: "not_reviewed" },
    });
  });
});

describe("a save the server accepted stays saved when the page cannot show it", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    addMessagesMock.mockReset();
  });

  afterEach(() => {
    resetApiConfig();
  });

  it("the runtime refusing the value → saved, not dirty, and a retry sends nothing", async () => {
    const fetchMock = serveKey({ en: EN_PLURAL });
    const manager = await loadKey();
    addMessagesMock.mockImplementation(() => {
      throw new Error("Invalid ICU message");
    });

    manager.updateTranslation("en", "one", "# document");
    const saved = await manager.saveTranslation();

    expect(saved).not.toBeNull();
    expect(manager.state.value.data?.sourceValues?.en).toBe(EN_EDITED);
    expect(manager.hasUnsavedChanges.value).toBe(false);
    expect(manager.state.value.error).toContain("Invalid ICU message");
    expect(manager.state.value.error).toMatch(/^Saved/);

    await manager.saveTranslation();
    expect(putCount(fetchMock)).toBe(1);
  });

  it("another key opened while the save settles → its editor shows no error from that save", async () => {
    serveKey({ en: EN_PLURAL });
    const manager = await loadKey();
    addMessagesMock.mockImplementation(() => {
      throw new Error("Invalid ICU message");
    });

    manager.updateTranslation("en", "one", "# document");
    const pending = manager.saveTranslation();
    const reload = manager.loadTranslation("files.count", "default");
    await Promise.all([pending, reload]);

    expect(addMessagesMock).toHaveBeenCalled();
    expect(manager.state.value.error).toBeNull();
    expect(manager.hasUnsavedChanges.value).toBe(false);
  });
});

describe("saving a plural key where no language can be rebuilt", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    addMessagesMock.mockReset();
  });

  afterEach(() => {
    resetApiConfig();
  });

  const EXACT = "{count, plural, =0 {None} one {One} other {# items}}";
  const MULTILINE = "{count, plural,\n  one {# Datei}\n  other {# Dateien}\n}";

  it.each([
    ["an exact-selector plural", { en: EXACT }, "en"],
    ["a multiline plural", { de: MULTILINE }, "de"],
    ["every language written as is", { en: EXACT, de: MULTILINE }, "en"],
  ])("sends %s as typed", async (_case, values: Record<string, string>, edited) => {
    const fetchMock = serveKey(values);
    const manager = await loadKey();
    const typed = "{count, plural, =0 {Nothing} one {One} other {# things}}";

    manager.updateTranslation(edited, "other", typed);
    const saved = await manager.saveTranslation();

    expect(manager.state.value.error).toBeNull();
    expect(saved).not.toBeNull();
    expect(sentTranslations(fetchMock)).toEqual({
      [edited]: { value: typed, status: "not_reviewed" },
    });
  });

  it("still requires a plural variable once a language is rebuilt from its fields", async () => {
    const fetchMock = serveKey({ en: EXACT });
    const manager = await loadKey();

    manager.updateTranslation("de", "one", "# Datei");
    const saved = await manager.saveTranslation();

    expect(saved).toBeNull();
    expect(manager.state.value.error).toBe("Validation failed: Plural variable name is required");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });
});

describe("switching between plural, variants and both", () => {
  beforeEach(() => {
    initApiConfig("test-api-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    resetApiConfig();
  });

  const GENDER = { variable: "gender", options: ["male", "other"] };

  it("keeps every plural form under each variant when variants are added to a plural", async () => {
    const fetchMock = serveKey({ en: "{count, plural, one {One item} other {# items}}" });
    const manager = await loadKey();

    manager.toggleSelectMode("en", true, GENDER);
    await manager.saveTranslation();

    expect(manager.translations.value.en).toEqual({
      "male:one": "One item",
      "male:other": "# items",
      "other:one": "One item",
      "other:other": "# items",
    });
    expect(sentTranslations(fetchMock).en!.value).toBe(
      "{gender, select, male {{count, plural, one {One item} other {# items}}} other {{count, plural, one {One item} other {# items}}}}",
    );
  });

  it("keeps the first variant's plural forms when variants are removed again", async () => {
    serveKey({
      en: "{gender, select, male {{count, plural, one {He has one} other {He has #}}} other {{count, plural, one {They have one} other {They have #}}}}",
    });
    const manager = await loadKey();

    manager.toggleSelectMode("en", false);

    expect(manager.translations.value.en).toEqual({ one: "He has one", other: "He has #" });
  });

  it("gives each variant every plural form when plural is switched on", async () => {
    const fetchMock = serveKey(
      { en: "{gender, select, male {His files} other {Their files}}" },
      false,
    );
    const manager = await loadKey();

    manager.togglePluralMode(true);
    await manager.saveTranslation();

    expect(manager.translations.value.en).toEqual({
      "male:one": "His files",
      "male:other": "His files",
      "other:one": "Their files",
      "other:other": "Their files",
    });
    expect(sentTranslations(fetchMock).en!.value).not.toContain("{}");
  });

  it("keeps each variant's other form when plural is switched off", async () => {
    serveKey({
      en: "{gender, select, male {{count, plural, one {He has one} other {He has #}}} other {{count, plural, one {They have one} other {They have #}}}}",
    });
    const manager = await loadKey();

    manager.togglePluralMode(false);

    expect(manager.translations.value.en).toEqual({ male: "He has #", other: "They have #" });
  });

  it("fills a new variant's plural forms from an existing variant", async () => {
    const fetchMock = serveKey({
      en: "{gender, select, male {{count, plural, one {He has one} other {He has #}}} other {{count, plural, one {They have one} other {They have #}}}}",
    });
    const manager = await loadKey();

    manager.updateSelectConfig("en", { options: ["male", "female", "other"] });
    await manager.saveTranslation();

    expect(manager.translations.value.en).toEqual({
      "male:one": "He has one",
      "male:other": "He has #",
      "female:one": "They have one",
      "female:other": "They have #",
      "other:one": "They have one",
      "other:other": "They have #",
    });
    expect(sentTranslations(fetchMock).en!.value).not.toContain("{}");
  });
});
