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

/** GET answers `values`; PUT echoes whatever was sent, as the API does. */
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
          Object.fromEntries(Object.entries(body.translations).map(([l, t]) => [l, t.value])),
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
  ])("sends a German value with %s back byte for byte", async (_case, german) => {
    const fetchMock = serveKey({ en: EN_PLURAL, de: german });
    const manager = await loadKey();

    manager.updateTranslation("en", "one", "# document");
    const saved = await manager.saveTranslation();

    expect(saved).not.toBeNull();
    expect(sentTranslations(fetchMock)).toEqual({
      en: { value: EN_EDITED, status: "not_reviewed" },
      de: { value: german, status: "not_reviewed" },
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
    expect(sentTranslations(fetchMock).en).toEqual({ value: EN_PLURAL, status: "not_reviewed" });
  });

  it("keeps such a message as it is when plural mode is switched off and on", async () => {
    const exact = "{count, plural, =0 {None} one {One} other {# items}}";
    const fetchMock = serveKey({ en: EN_PLURAL, de: exact });
    const manager = await loadKey();

    manager.togglePluralMode(false);
    manager.togglePluralMode(true);
    manager.toggleSelectMode("de", true);
    await manager.saveTranslation();

    expect(sentTranslations(fetchMock).de).toEqual({ value: exact, status: "not_reviewed" });
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
    expect(sentTranslations(fetchMock)).toEqual(
      Object.fromEntries(
        Object.entries({ ...values, [edited]: typed }).map(([lang, value]) => [
          lang,
          { value, status: "not_reviewed" },
        ]),
      ),
    );
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
