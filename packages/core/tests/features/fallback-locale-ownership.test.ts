import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

// The host owns its fallback chain: a caller mutating the array it passed in
// must not change translation output behind `configChanged`/`configRevision`.
describe("fallback locale arrays are copied on the way in", () => {
  const messages = { fr: { greeting: "FR" }, de: { greeting: "DE" } };

  it("ignores mutation of the array passed to the constructor", () => {
    const fallbacks = ["fr"];
    const i18n = createI18n({ locale: "en", fallbackLocale: fallbacks, messages });

    fallbacks[0] = "de";

    expect(i18n.t("greeting")).toBe("FR");
    expect(i18n.getFallbackLocales()).toEqual(["fr"]);
    expect(i18n.configRevision).toBe(0);
  });

  it("ignores mutation of the array passed to setFallbackLocale()", () => {
    const i18n = createI18n({ locale: "en", messages });
    const fallbacks = ["fr"];
    i18n.setFallbackLocale(fallbacks);

    fallbacks[0] = "de";

    expect(i18n.t("greeting")).toBe("FR");
    expect(i18n.getFallbackLocales()).toEqual(["fr"]);
    expect(i18n.configRevision).toBe(1);
  });

  it("accepts readonly arrays at the type boundary", () => {
    const frozen: readonly string[] = Object.freeze(["fr"]);
    const i18n = createI18n({ locale: "en", fallbackLocale: frozen, messages });
    i18n.setFallbackLocale(frozen);

    expect(i18n.t("greeting")).toBe("FR");
  });
});
