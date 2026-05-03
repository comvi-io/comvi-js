import { describe, it, expect, vi } from "vitest";
import { I18n, createBoundTranslation } from "../../src";

describe("Utilities", () => {
  describe("createBoundTranslation", () => {
    it("uses the bound namespace and still allows explicit namespace override", () => {
      const i18n = new I18n({ locale: "en" });
      i18n.addTranslations({
        "en:common": { cancel: "Cancel", greeting: "Hello {name}" },
        "en:modal": { cancel: "Close Modal", greeting: "Modal {name}" },
      });

      const t = createBoundTranslation(i18n, "common");

      expect(t("cancel")).toBe("Cancel");
      expect(t("greeting", { name: "Alice" })).toBe("Hello Alice");
      expect(t("cancel", { ns: "modal" })).toBe("Close Modal");
      expect(t("greeting", { ns: "modal", name: "Alice" })).toBe("Modal Alice");
    });

    it("treats nullish params as omitted params and keeps the bound namespace", () => {
      const i18n = new I18n({ locale: "en" });
      i18n.addTranslations({
        "en:common": { cancel: "Cancel" },
      });

      const t = createBoundTranslation(i18n, "common");

      expect(t("cancel", null as any)).toBe("Cancel");
      expect(t("cancel", undefined as any)).toBe("Cancel");
    });

    it("delegates to i18n.t behavior when no default namespace is bound", () => {
      const i18n = new I18n({ locale: "en" });
      i18n.addTranslations({
        "en:default": { hello: "Hello" },
        "en:admin": { hello: "Admin Hello" },
      });

      const t = createBoundTranslation(i18n);

      expect(t("hello")).toBe("Hello");
      expect(t("hello", { ns: "admin" })).toBe("Admin Hello");
    });

    it("does not leak post-processor mutations between no-params calls", () => {
      const i18n = new I18n({ locale: "en" });
      i18n.addTranslations({
        "en:common": { hello: "Hello" },
      });

      const seenMarkers: Array<string | undefined> = [];
      const processor = vi.fn((result, _key, _ns, params) => {
        seenMarkers.push(params.marker as string | undefined);
        params.marker = "mutated";
        return result;
      });
      i18n.registerPostProcessor(processor);

      const t = createBoundTranslation(i18n, "common");
      t("hello");
      t("hello");

      expect(processor).toHaveBeenCalledTimes(2);
      expect(seenMarkers).toEqual([undefined, undefined]);
    });
  });
});
