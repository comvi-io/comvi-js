import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";

describe("missing-parameter warning dedup", () => {
  it("warns for two templates whose (template, param) pairs concatenate to the same text", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = new I18n({ locale: "en" });
    i18n.addTranslations({ en: { first: "{ab}{b}", second: "{ab}{b}a" } });

    i18n.t("first", { b: "x" });
    i18n.t("second", { ab: "y" });

    expect(
      warnSpy.mock.calls
        .map((call) => call[0])
        .filter((message) => typeof message === "string" && message.includes("Missing parameter")),
    ).toEqual([
      '[i18n] Missing parameter "ab" for template "{ab}{b}"',
      '[i18n] Missing parameter "b" for template "{ab}{b}a"',
    ]);
  });
});
