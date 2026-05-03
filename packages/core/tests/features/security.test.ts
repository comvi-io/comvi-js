import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";

describe("Security and Error Handling", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("String Safety (Passthrough)", () => {
    // Comvi i18n itself is output-agnostic (returns strings/nodes).
    // It should NOT strip tags automatically, as that might break valid HTML translations.
    // It's the consumer's job to sanitize. Comvi i18n acts as a passthrough.

    it("should interpolate malicious scripts into parameters without executing them (passthrough)", () => {
      const malicious = "<script>alert(1)</script>";
      i18n.addTranslations({ en: { msg: "User: {name}" } });
      expect(i18n.t("msg", { name: malicious })).toBe(`User: ${malicious}`);
    });

    it("should pass through deeply nested/recursive HTML input unchanged", () => {
      const nested = "<div><div><div><script>alert('deep')</script></div></div></div>";
      i18n.addTranslations({ en: { deep: "Content: {html}" } });
      expect(i18n.t("deep", { html: nested })).toBe(`Content: ${nested}`);
    });

    it("should handle excessively long keys by returning the key itself when missing", () => {
      const longKey = "a".repeat(10000);
      // It returns the key itself when it's missing
      expect(i18n.t(longKey)).toBe(longKey);
    });
  });

  describe("Malformed Templates", () => {
    it("should handle unclosed braces gracefully and warn", () => {
      i18n.addTranslations({ en: { bad: "Hello {name" } });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Parser returns best effort and warns about malformed template
      expect(i18n.t("bad", { name: "World" })).toBe("Hello {name");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unbalanced braces"));

      warnSpy.mockRestore();
    });

    it("should handle unexpected closing braces", () => {
      i18n.addTranslations({ en: { bad: "Hello } name" } });
      expect(i18n.t("bad")).toBe("Hello } name");
    });
  });
});
