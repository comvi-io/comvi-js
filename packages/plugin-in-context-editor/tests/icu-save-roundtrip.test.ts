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
