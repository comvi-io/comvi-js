import { describe, it, expect } from "vitest";
import { buildApiExportUrl, buildApiTranslationsUrl } from "../src/index";

const API = "https://api.example.com";

describe("buildApiTranslationsUrl()", () => {
  it("puts the locale and the single namespace in the query string", () => {
    expect(buildApiTranslationsUrl("en", ["default"], API)).toBe(
      "https://api.example.com/v1/translations?locales=en&namespaces=default",
    );
  });

  it("joins several namespaces with a comma", () => {
    expect(buildApiTranslationsUrl("en", ["default", "dashboard"], API)).toBe(
      "https://api.example.com/v1/translations?locales=en&namespaces=default%2Cdashboard",
    );
  });

  it("rejects a traversal locale and names the locale in the error", () => {
    expect(() => buildApiTranslationsUrl("../hack", ["default"], API)).toThrow(
      '[FetchLoader] Invalid locale: "../hack"',
    );
  });

  it("rejects a traversal namespace and names the namespace in the error", () => {
    expect(() => buildApiTranslationsUrl("en", ["default", "../hack"], API)).toThrow(
      '[FetchLoader] Invalid namespace: "../hack"',
    );
  });
});

describe("API base URL normalisation", () => {
  it("drops a single trailing slash from the translations base URL", () => {
    expect(buildApiTranslationsUrl("en", ["default"], "https://api.example.com/")).toBe(
      "https://api.example.com/v1/translations?locales=en&namespaces=default",
    );
  });

  it("drops a single trailing slash from the export base URL", () => {
    expect(buildApiExportUrl(42, "en", ["default"], "https://api.example.com/")).toBe(
      "https://api.example.com/v1/projects/42/export?locales=en&namespaces=default",
    );
  });
});
