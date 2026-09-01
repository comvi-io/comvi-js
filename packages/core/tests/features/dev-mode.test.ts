import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";

describe("the devMode option", () => {
  it.each([true, false])("exposes devMode=%s to plugins", async (devMode) => {
    let pluginDevModeValue: boolean | undefined;

    const i18n = new I18n({ locale: "en", devMode });
    const testPlugin = (instance: typeof i18n) => {
      pluginDevModeValue = instance.devMode;
    };

    i18n.use(testPlugin);
    await i18n.init();

    expect(pluginDevModeValue).toBe(devMode);
  });
});

describe("the strict option", () => {
  it("strict mode logs warnings for missing keys via console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = new I18n({ locale: "en", strict: "dev" });

    i18n.t("nonexistent.key");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Translation not found: "nonexistent.key"'),
      { key: "nonexistent.key", locale: "en", namespace: "default" },
    );
  });

  it("does not log warnings for missing keys when strict is off", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = new I18n({ locale: "en", strict: "off" });

    i18n.t("nonexistent.key");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent when a key resolves through a fallback locale", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = new I18n({
      locale: "de",
      fallbackLocale: "en",
      strict: "dev",
      translation: { en: { greeting: "Hello" } },
    });

    expect(i18n.t("greeting")).toBe("Hello");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
