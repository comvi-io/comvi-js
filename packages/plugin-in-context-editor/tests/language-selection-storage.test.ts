import { describe, expect, it, vi } from "vitest";
import {
  persistSelectedLanguages,
  restoreSelectedLanguages,
} from "../src/utils/languageSelectionStorage";

const languages = [
  { code: "en", name: "English" },
  { code: "uk", name: "Ukrainian" },
];

describe("language selection storage", () => {
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

  it("ignores storage write failures", () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    };

    expect(() => persistSelectedLanguages(["en"], storage)).not.toThrow();
  });
});
