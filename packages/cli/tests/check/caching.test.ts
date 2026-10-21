import { describe, expect, it, vi } from "vitest";
import * as typegen from "@comvi/typegen";
import { CatalogCheck } from "../../src/core/CatalogCheck";

vi.mock("@comvi/typegen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/typegen")>();
  return { ...actual, scanMessageShape: vi.fn(actual.scanMessageShape) };
});

/**
 * Not rules: the two caches that keep a large catalog cheap, asserted by call
 * counts rather than time so the guard holds on any machine. Each source
 * message is scanned once however many locales compare against it, each
 * message once in all, and each locale's plural rules are looked up once per
 * rule type. Timing lives in `scripts/check-bench.mjs`, which is not a gate.
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

  it.each([100, 200])(
    "scans each of %i keys once per locale: the work grows linearly with the catalog",
    (keys) => {
      const scan = vi.mocked(typegen.scanMessageShape);
      scan.mockClear();
      const catalog = (prefix: string) =>
        Object.fromEntries(
          Array.from({ length: keys }, (_, i) => [
            `k${i}`,
            `${prefix} {name} {n, plural, one {#} other {#}} <b>${i}</b>`,
          ]),
        );
      const targets = ["de", "fr", "ja"];

      CatalogCheck.run({
        translations: Object.fromEntries(
          ["en", ...targets].map((locale) => [locale, { default: catalog(locale) }]),
        ),
        source: "en",
        targets,
        namespaces: ["default"],
        pluralCategories: () => ["one", "other"],
      });

      // Exactly one scan per (locale, key) message: no re-parse per target,
      // nothing quadratic. Doubling the keys doubles the scans.
      expect(scan).toHaveBeenCalledTimes(keys * (1 + targets.length));
    },
  );

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

    // Once for the source (en) and once for the target (de), however many keys.
    expect(supported).toHaveBeenCalledTimes(2);
  });
});
