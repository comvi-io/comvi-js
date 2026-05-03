import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";

describe("Namespace Management", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("should support explicit namespace parameter", () => {
    i18n.addTranslations({
      "en:ns1": { key: "Value 1" },
      "en:ns2": { key: "Value 2" },
    });

    expect(i18n.t("key", { ns: "ns1" })).toBe("Value 1");
    expect(i18n.t("key", { ns: "ns2" })).toBe("Value 2");
  });

  it("should not fall back to default namespace when explicit ns is missing", () => {
    i18n.addTranslations({
      "en:default": { key: "Default Value" },
      "en:admin": { other: "Admin Value" },
    });

    // Should NOT find 'key' in 'admin'
    expect(i18n.t("key", { ns: "admin" })).toBe("key");
  });

  it("should support configuring a default namespace", () => {
    i18n = new I18n({ locale: "en", defaultNs: "common" });
    i18n.addTranslations({ "en:common": { key: "Common Value" } });
    expect(i18n.t("key")).toBe("Common Value");
  });

  it("emits defaultNamespaceChanged and switches lookups to the new namespace", () => {
    i18n.addTranslations({
      "en:default": { key: "Default Value" },
      "en:admin": { key: "Admin Value" },
    });
    const onDefaultNamespaceChanged = vi.fn();
    i18n.on("defaultNamespaceChanged", onDefaultNamespaceChanged);

    i18n.setDefaultNamespace("admin");

    expect(onDefaultNamespaceChanged).toHaveBeenCalledTimes(1);
    expect(onDefaultNamespaceChanged).toHaveBeenCalledWith({ from: "default", to: "admin" });
    expect(i18n.t("key")).toBe("Admin Value");

    i18n.setDefaultNamespace("admin");
    expect(onDefaultNamespaceChanged).toHaveBeenCalledTimes(1);
  });

  it("should clear translations for a specific namespace", () => {
    i18n.addTranslations({
      "en:common": { key: "Keep me" },
      "en:temp": { key: "Delete me" },
    });

    expect(i18n.t("key", { ns: "temp" })).toBe("Delete me");

    i18n.clearTranslations("en", "temp");

    expect(i18n.hasTranslation("key", "en", "common")).toBe(true);
    expect(i18n.hasTranslation("key", "en", "temp")).toBe(false);
  });

  it("should remove namespace from active tracking when cleared", async () => {
    const loaderCalls: string[] = [];
    i18n.registerLoader(async (lang, ns) => {
      loaderCalls.push(`${lang}:${ns}`);
      return { key: `${lang}:${ns}` };
    });

    await i18n.addActiveNamespace("admin");

    expect(loaderCalls).toEqual(["en:admin"]);
    expect(i18n.t("key", { ns: "admin" })).toBe("en:admin");
    expect(i18n.getActiveNamespaces()).toContain("admin");

    i18n.clearTranslations(undefined, "admin");

    expect(i18n.t("key", { ns: "admin" })).toBe("key");
    expect(i18n.getActiveNamespaces()).not.toContain("admin");

    await i18n.setLocaleAsync("fr");
    expect(loaderCalls).toEqual(["en:admin"]);
  });

  it("keeps successful namespace loads when another namespace fails", async () => {
    const onError = vi.fn();
    i18n = new I18n({ locale: "en", ns: [], onError });

    i18n.registerLoader(async (_lang, ns) => {
      if (ns === "bad") {
        throw new Error("bad namespace");
      }
      return { key: `${ns}-value` };
    });

    await i18n.init();
    await i18n.addActiveNamespaces(["good", "bad"]);

    expect(i18n.t("key", { ns: "good" })).toBe("good-value");
    expect(i18n.t("key", { ns: "bad" })).toBe("key");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain("Partial namespace load failure");
    expect(onError.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        source: "namespace-load",
        locale: "en",
        namespace: "bad",
      }),
    );
  });

  it("reloads only the requested locale and namespace", async () => {
    i18n = new I18n({ locale: "en", fallbackLocale: "fr", ns: [] });

    const loaderCalls: string[] = [];
    const loadVersions = new Map<string, number>();

    i18n.registerLoader(async (lang, ns) => {
      const key = `${lang}:${ns}`;
      loaderCalls.push(key);
      const version = (loadVersions.get(key) ?? 0) + 1;
      loadVersions.set(key, version);
      return { marker: `${key}:v${version}` };
    });

    await i18n.init();
    await i18n.addActiveNamespaces(["common", "admin"]);
    await i18n.setLocaleAsync("fr");

    expect(i18n.t("marker", { locale: "fr", ns: "admin" })).toBe("fr:admin:v1");
    expect(i18n.t("marker", { locale: "fr", ns: "common" })).toBe("fr:common:v1");
    expect(i18n.t("marker", { locale: "en", ns: "admin" })).toBe("en:admin:v1");

    const callsBeforeReload = loaderCalls.length;
    await i18n.reloadTranslations("fr", "admin");

    expect(loaderCalls).toHaveLength(callsBeforeReload + 1);
    expect(loaderCalls[callsBeforeReload]).toBe("fr:admin");

    expect(i18n.t("marker", { locale: "fr", ns: "admin" })).toBe("fr:admin:v2");
    expect(i18n.t("marker", { locale: "fr", ns: "common" })).toBe("fr:common:v1");
    expect(i18n.t("marker", { locale: "en", ns: "admin" })).toBe("en:admin:v1");
  });

  it("should throw an error if all reload attempts fail", async () => {
    i18n.registerLoader(async () => {
      throw new Error("Network error");
    });

    i18n.addTranslations({ "en:admin": { key: "val" } });
    await i18n.addActiveNamespace("admin");

    await expect(i18n.reloadTranslations()).rejects.toThrow(
      /Failed to reload translations|E_FAILED_RELOAD_TRANSLATIONS/,
    );
  });

  describe("colon in key name", () => {
    it("resolves a literal colon-containing key in the default namespace", () => {
      const instance = new I18n({ locale: "en" });
      instance.addTranslations({
        "en:default": { "foo:bar": "Value with colon" },
      });

      expect(instance.t("foo:bar")).toBe("Value with colon");
    });

    it("resolves a literal colon-containing key in a non-default namespace", () => {
      const instance = new I18n({ locale: "en" });
      instance.addTranslations({
        "en:ui": { "a:b:c": "Deep colons" },
      });

      expect(instance.t("a:b:c", { ns: "ui" })).toBe("Deep colons");
    });

    it("does not confuse a colon-containing key with namespace:key shorthand", () => {
      const instance = new I18n({ locale: "en" });
      instance.addTranslations({
        "en:default": { "foo:bar": "Key in default ns" },
        "en:foo": { bar: "Key in foo ns" },
      });

      expect(instance.t("foo:bar")).toBe("Key in default ns");
      expect(instance.t("bar", { ns: "foo" })).toBe("Key in foo ns");
    });
  });
});
