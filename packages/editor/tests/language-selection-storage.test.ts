import { describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_SELECTION_STORAGE_KEY,
  persistSelectedLanguages,
  restoreSelectedLanguages,
} from "../src/utils/languageSelectionStorage";

const languages = [
  { code: "en", name: "English" },
  { code: "uk", name: "Ukrainian" },
];

describe("restoreSelectedLanguages()", () => {
  it("returns the persisted selection when every code is available", () => {
    const storage = { getItem: vi.fn(() => '["uk"]') };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["uk"]);
    expect(storage.getItem).toHaveBeenCalledWith(LANGUAGE_SELECTION_STORAGE_KEY);
  });

  it("falls back to all languages when nothing is persisted", () => {
    const storage = { getItem: vi.fn(() => null) };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["en", "uk"]);
  });

  it("falls back to all languages when storage reads throw", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["en", "uk"]);
  });

  it("falls back to all languages when persisted JSON is not an array", () => {
    const storage = { getItem: vi.fn(() => '{"en":true}') };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["en", "uk"]);
  });

  it("keeps only valid string language codes", () => {
    const storage = { getItem: vi.fn(() => JSON.stringify(["uk", 42, "missing"])) };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["uk"]);
  });

  it("falls back to all languages when no persisted code is still available", () => {
    const storage = { getItem: vi.fn(() => '["fr"]') };

    expect(restoreSelectedLanguages(languages, storage)).toEqual(["en", "uk"]);
  });
});

describe("persistSelectedLanguages()", () => {
  it("writes the selection as a JSON array under the storage key", () => {
    const storage = { setItem: vi.fn() };

    persistSelectedLanguages(["en"], storage);

    expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_SELECTION_STORAGE_KEY, '["en"]');
  });

  it("writes an empty array when no language is selected", () => {
    const storage = { setItem: vi.fn() };

    persistSelectedLanguages([], storage);

    expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_SELECTION_STORAGE_KEY, "[]");
  });

  it("ignores storage write failures", () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    };

    expect(() => persistSelectedLanguages(["en"], storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_SELECTION_STORAGE_KEY, '["en"]');
  });
});
