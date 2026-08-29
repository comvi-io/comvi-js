import { describe, it, expect, beforeEach, vi } from "vitest";
import { I18n } from "../../src";

describe("Security and Error Handling", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  describe("String Safety (Passthrough)", () => {
    // Deliberate passthrough: stripping tags automatically would break valid
    // HTML translations, so sanitizing is the consumer's job.

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
      expect(i18n.t(longKey)).toBe(longKey);
    });

    it("does not re-parse braces that arrive inside a parameter value", () => {
      i18n.addTranslations({ en: { msg: "User: {name}" } });

      expect(i18n.t("msg", { name: "{injected}" })).toBe("User: {injected}");
    });

    it("does not resolve a placeholder smuggled in through another parameter's value", () => {
      i18n.addTranslations({ en: { msg: "User: {name}" } });

      expect(i18n.t("msg", { name: "{injected}", injected: "owned" })).toBe("User: {injected}");
    });
  });

  describe("Malformed Templates", () => {
    it("should handle unclosed braces gracefully and warn", () => {
      i18n.addTranslations({ en: { bad: "Hello {name" } });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Best effort plus a warning; never a throw.
      expect(i18n.t("bad", { name: "World" })).toBe("Hello {name");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unbalanced braces"));
    });

    it("renders an unmatched closing brace literally and does not warn", () => {
      i18n.addTranslations({ en: { bad: "Hello } name" } });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(i18n.t("bad")).toBe("Hello } name");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
