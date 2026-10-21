import { describe, expect, it, vi } from "vitest";
import * as typegen from "@comvi/typegen";
import { CatalogCheck } from "../../src/core/CatalogCheck";

vi.mock("@comvi/typegen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/typegen")>();
  return { ...actual, scanMessageShape: vi.fn(actual.scanMessageShape) };
});

/**
 * Not rules: the two caches that keep a large catalog cheap. Each source
 * message is scanned once however many locales compare against it, and each
 * locale's plural rules are looked up once per rule type.
 */
describe("check caching", () => {
  it("scans each source message once across targets", () => {
    const scan = vi.mocked(typegen.scanMessageShape);
    scan.mockClear();

    CatalogCheck.run({
      translations: {
        en: { default: { a: "{x}", b: "{y}" } },
        de: { default: { a: "{x}", b: "{y}" } },
        fr: { default: { a: "{x}", b: "{y}" } },
      },
      source: "en",
      targets: ["de", "fr"],
      namespaces: ["default"],
      pluralCategories: () => ["other"],
    });

    // 2 source messages once each + 4 target messages.
    expect(scan).toHaveBeenCalledTimes(6);
  });

  it("asks Intl for a locale's plural rules once per rule type", () => {
    const supported = vi.spyOn(Intl.PluralRules, "supportedLocalesOf");

    CatalogCheck.run({
      translations: {
        en: {
          default: { a: "{n, plural, one {#} other {#}}", b: "{n, plural, one {#} other {#}}" },
        },
        de: {
          default: { a: "{n, plural, one {#} other {#}}", b: "{n, plural, one {#} other {#}}" },
        },
      },
      source: "en",
      targets: ["de"],
      namespaces: ["default"],
    });

    expect(supported).toHaveBeenCalledTimes(1);
  });
});
