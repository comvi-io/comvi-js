import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";

describe("addMessages event behaviour", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("emits namespaceLoaded for each (locale, namespace) added", () => {
    const spy = vi.fn();
    i18n.on("namespaceLoaded", spy);

    i18n.addMessages({ en: { greeting: "hi" } });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ locale: "en", namespace: "default" });
  });

  it("does NOT emit configChanged when translations are added", () => {
    const configSpy = vi.fn();
    i18n.on("configChanged", configSpy);

    i18n.addMessages({ en: { greeting: "hi" } });

    expect(configSpy).not.toHaveBeenCalled();
  });

  it("makes the translation immediately queryable after addMessages", () => {
    i18n.addMessages({ en: { greeting: "hi" } });

    expect(i18n.t("greeting")).toBe("hi");
    expect(i18n.getMessages("en", "default")).toEqual({ greeting: "hi" });
  });

  it("emits namespaceLoaded for multiple locales at once", () => {
    const spy = vi.fn();
    i18n.on("namespaceLoaded", spy);

    i18n.addMessages({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });

    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      { locale: "en", namespace: "default" },
      { locale: "fr", namespace: "default" },
    ]);
  });

  it("empty-object addMessages({}) fires neither namespaceLoaded nor configChanged and does not throw", () => {
    const namespaceSpy = vi.fn();
    const configSpy = vi.fn();
    i18n.on("namespaceLoaded", namespaceSpy);
    i18n.on("configChanged", configSpy);

    expect(() => i18n.addMessages({})).not.toThrow();

    expect(namespaceSpy).not.toHaveBeenCalled();
    expect(configSpy).not.toHaveBeenCalled();
  });

  // Asymmetry with the constructor, which throws E_MESSAGES_NOT_OBJECT for the
  // same input; addMessages has no such validation.
  it("stores an empty catalog and still emits for a non-object locale value", () => {
    const spy = vi.fn();
    i18n.on("namespaceLoaded", spy);

    expect(() => i18n.addMessages({ en: null as unknown as Record<string, string> })).not.toThrow();

    expect(spy).toHaveBeenCalledWith({ locale: "en", namespace: "default" });
    expect(i18n.getMessages("en", "default")).toEqual({});
  });
});
