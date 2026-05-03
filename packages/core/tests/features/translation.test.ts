import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n, createElement } from "../../src";

describe("Core Translation Features", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("Null Key Guard", () => {
    it("should return empty string for null key", () => {
      expect(i18n.t(null as any)).toBe("");
    });
  });

  describe("Basic Lookup", () => {
    it("should translate flat keys", () => {
      i18n.addTranslations({ en: { hello: "Hello World" } });
      expect(i18n.t("hello")).toBe("Hello World");
    });

    it("should translate nested keys", () => {
      i18n.addTranslations({
        en: {
          nav: {
            header: {
              title: "My App",
            },
          },
        },
      });
      expect(i18n.t("nav.header.title")).toBe("My App");
    });

    it("should preserve mixed flat and nested keys", () => {
      i18n.addTranslations({
        en: {
          "nav.header.title": "My App",
          nav: {
            header: {
              subtitle: "Dashboard",
            },
          },
        } as any,
      });

      expect(i18n.t("nav.header.title")).toBe("My App");
      expect(i18n.t("nav.header.subtitle")).toBe("Dashboard");
    });

    it("sanitizes already-flat translations added programmatically in place", () => {
      const flatTranslations = {
        "nav.header.title": "Original",
      };

      i18n.addTranslations({
        en: flatTranslations,
      });

      expect(Object.getPrototypeOf(flatTranslations)).toBe(null);
      expect(i18n.t("nav.header.title")).toBe("Original");
      expect(i18n.hasTranslation("toString")).toBe(false);
    });

    it("applies constructor postProcess to translation results", () => {
      const i18nWithPostProcess = new I18n({
        locale: "en",
        postProcess: (result) => (typeof result === "string" ? `[${result}]` : result),
        translation: {
          en: { hello: "Hello" },
        },
      });

      expect(i18nWithPostProcess.t("hello")).toBe("[Hello]");
    });
  });

  describe("Interpolation", () => {
    it("should interpolate named parameters", () => {
      i18n.addTranslations({ en: { welcome: "Welcome, {name}!" } });
      expect(i18n.t("welcome", { name: "Alice" })).toBe("Welcome, Alice!");
    });

    it("should interpolate multiple parameters", () => {
      i18n.addTranslations({ en: { info: "{name} is {age} years old." } });
      expect(i18n.t("info", { name: "Bob", age: 30 })).toBe("Bob is 30 years old.");
    });

    it("should handle number parameters", () => {
      i18n.addTranslations({ en: { count: "Count: {n}" } });
      expect(i18n.t("count", { n: 0 })).toBe("Count: 0");
      expect(i18n.t("count", { n: 100 })).toBe("Count: 100");
      expect(i18n.t("count", { n: -5 })).toBe("Count: -5");
    });

    it("should handle boolean parameters (coerced to string)", () => {
      i18n.addTranslations({ en: { status: "Active: {isActive}" } });
      expect(i18n.t("status", { isActive: true })).toBe("Active: true");
      expect(i18n.t("status", { isActive: false })).toBe("Active: false");
    });

    it("should handle missing parameters by returning empty string for the param", () => {
      i18n.addTranslations({ en: { greet: "Hello {name}!" } });
      expect(i18n.t("greet", {})).toBe("Hello !");
      expect(i18n.t("greet", { name: null })).toBe("Hello !");
      expect(i18n.t("greet", { name: undefined })).toBe("Hello !");
    });

    it("should allow whitespace in parameter placeholders", () => {
      i18n.addTranslations({ en: { loose: "Hi { name }!" } });
      expect(i18n.t("loose", { name: "Trimmed" })).toBe("Hi Trimmed!");
    });
  });

  describe("Missing Keys & Fallbacks", () => {
    it("should return the key itself if translation is missing", () => {
      expect(i18n.t("missing.key")).toBe("missing.key");
    });

    it("should trigger the missing key handler", () => {
      let capturedKey = "";
      let capturedLocale = "";
      let capturedNamespace = "";
      i18n.onMissingKey((key, locale, namespace) => {
        capturedKey = key;
        capturedLocale = locale;
        capturedNamespace = namespace;
      });

      i18n.t("unknown");

      expect(capturedKey).toBe("unknown");
      expect(capturedLocale).toBe("en");
      expect(capturedNamespace).toBe("default");
    });

    it("should stop firing after onMissingKey cleanup is called", () => {
      const callback = vi.fn();
      const cleanup = i18n.onMissingKey(callback);

      i18n.t("missing1");
      expect(callback).toHaveBeenCalledTimes(1);

      cleanup();

      i18n.t("missing2");
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should pass missing keys through post-processors", () => {
      i18n.registerPostProcessor((result) => {
        if (typeof result === "string") {
          return `[${result}]`;
        }
        return result;
      });

      // The key itself is returned as missing result, then post-processed
      expect(i18n.t("missing.key")).toBe("[missing.key]");
    });

    it("should pass fallback values through post-processors", () => {
      i18n.registerPostProcessor((result) => {
        if (typeof result === "string") {
          return `[${result}]`;
        }
        return result;
      });

      // The fallback is returned as missing result, then post-processed
      expect(i18n.t("missing.key", { fallback: "Fallback text" })).toBe("[Fallback text]");
    });

    it("should allow missing key handler to return TranslationResult", () => {
      const vnode = createElement("strong", {}, ["X"]);
      i18n.onMissingKey(() => ["Missing ", vnode]);

      const result = i18n.tRaw("unknown.key");

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("Missing ");
      expect(result[1]).toBe(vnode);
      expect(i18n.t("unknown.key")).toBe("Missing X");
    });

    it("should fallback to deep keys if parents are missing", () => {
      i18n.addTranslations({ en: { a: "foo" } });
      expect(i18n.t("a.b")).toBe("a.b");
    });

    it("passes fallback-locale hits through post-processors", () => {
      i18n = new I18n({
        locale: "de",
        fallbackLocale: "en",
      });
      i18n.addTranslations({
        en: { greeting: "Hello" },
      });
      i18n.registerPostProcessor((result) =>
        typeof result === "string" ? `>>${result}<<` : result,
      );

      expect(i18n.t("greeting")).toBe(">>Hello<<");
    });
  });

  describe("Per-Call Fallback Parameter", () => {
    beforeEach(() => {
      i18n.addTranslations({ en: { existing: "I exist" } });
    });

    it("should use fallback text if key is missing", () => {
      expect(i18n.t("missing", { fallback: "Default Text" })).toBe("Default Text");
    });

    it("should prefer existing translation over fallback", () => {
      expect(i18n.t("existing", { fallback: "Default Text" })).toBe("I exist");
    });

    it("should interpolate fallback text", () => {
      expect(i18n.t("missing", { fallback: "Default {val}", val: "Value" })).toBe("Default Value");
    });

    it("should apply tag interpolation to fallback text", () => {
      const i18nWithTags = new I18n({
        locale: "en",
        tagInterpolation: { basicHtmlTags: ["strong"] },
      });

      const result = i18nWithTags.tRaw("missing", {
        fallback: "Hello <strong>world</strong>",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("Hello ");
      expect((result as any[])[1]).toMatchObject({ type: "element", tag: "strong" });
      expect(i18nWithTags.t("missing", { fallback: "Hello <strong>world</strong>" })).toBe(
        "Hello world",
      );
    });

    it("should not cache the fallback as the translation for the key", () => {
      // First call uses fallback
      expect(i18n.t("missing", { fallback: "F1" })).toBe("F1");

      // Second call with different fallback
      expect(i18n.t("missing", { fallback: "F2" })).toBe("F2");

      // Third call without fallback returns key
      expect(i18n.t("missing")).toBe("missing");
    });
  });
});
