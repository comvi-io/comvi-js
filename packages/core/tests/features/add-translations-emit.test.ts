import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";

describe("addTranslations event behaviour", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("emits namespaceLoaded for each (locale, namespace) added", () => {
    const spy = vi.fn();
    i18n.on("namespaceLoaded", spy);

    i18n.addTranslations({ en: { greeting: "hi" } });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ locale: "en", namespace: "default" });
  });

  it("does NOT emit configChanged when translations are added", () => {
    const configSpy = vi.fn();
    i18n.on("configChanged", configSpy);

    i18n.addTranslations({ en: { greeting: "hi" } });

    expect(configSpy).not.toHaveBeenCalled();
  });

  it("makes the translation immediately queryable after addTranslations", () => {
    i18n.addTranslations({ en: { greeting: "hi" } });

    expect(i18n.t("greeting")).toBe("hi");
    expect(i18n.getTranslations("en", "default")).toMatchObject({ greeting: "hi" });
  });

  it("emits namespaceLoaded for multiple locales at once", () => {
    const spy = vi.fn();
    i18n.on("namespaceLoaded", spy);

    i18n.addTranslations({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const calls = spy.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        { locale: "en", namespace: "default" },
        { locale: "fr", namespace: "default" },
      ]),
    );
  });

  it("empty-object addTranslations({}) fires neither namespaceLoaded nor configChanged and does not throw", () => {
    const namespaceSpy = vi.fn();
    const configSpy = vi.fn();
    i18n.on("namespaceLoaded", namespaceSpy);
    i18n.on("configChanged", configSpy);

    expect(() => i18n.addTranslations({})).not.toThrow();

    expect(namespaceSpy).not.toHaveBeenCalled();
    expect(configSpy).not.toHaveBeenCalled();
  });
});
