/**
 * An empty string is a value nobody has written yet — what a translation
 * platform publishes for an untranslated key. The lookup walks the fallback
 * chain past it, and only settles for it when no locale has text.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

const make = (messages: Record<string, Record<string, string>>, onMissingKey = vi.fn()) =>
  createI18n({
    locale: "de",
    fallbackLocale: ["fr", "en"],
    exposeGlobal: false,
    messages,
    onMissingKey,
  });

describe("t() with an empty translation", () => {
  it("empty in the locale, text in a fallback → the fallback text", () => {
    const i18n = make({ de: { title: "" }, en: { title: "Title" } });

    expect(i18n.t("title")).toBe("Title");
  });

  it("empty in the locale and in the first fallback → the next fallback's text", () => {
    const i18n = make({ de: { title: "" }, fr: { title: "" }, en: { title: "Title" } });

    expect(i18n.t("title")).toBe("Title");
  });

  it("absent in the locale, empty in the first fallback → the next fallback's text", () => {
    const i18n = make({ de: {}, fr: { title: "" }, en: { title: "Title" } });

    expect(i18n.t("title")).toBe("Title");
  });

  it("the fallback's text is interpolated with the call's params", () => {
    const i18n = make({ de: { hi: "" }, en: { hi: "Hi {name}" } });

    expect(i18n.t("hi", { name: "Ada" })).toBe("Hi Ada");
  });

  it("empty in the locale, absent everywhere else → the empty string, not the key", () => {
    const onMissingKey = vi.fn();
    const i18n = make({ de: { title: "" }, en: {} }, onMissingKey);

    expect(i18n.t("title")).toBe("");
    expect(onMissingKey).not.toHaveBeenCalled();
  });

  it("absent in the locale, empty in a fallback, text nowhere → the empty string", () => {
    const onMissingKey = vi.fn();
    const i18n = make({ de: {}, fr: { title: "" }, en: {} }, onMissingKey);

    expect(i18n.t("title")).toBe("");
    expect(onMissingKey).not.toHaveBeenCalled();
  });

  it("empty with no fallback chain → the empty string", () => {
    const i18n = createI18n({ locale: "de", exposeGlobal: false, messages: { de: { title: "" } } });

    expect(i18n.t("title")).toBe("");
  });

  it("text in the locale → the fallback is not consulted", () => {
    const i18n = make({ de: { title: "Titel" }, en: { title: "Title" } });

    expect(i18n.t("title")).toBe("Titel");
  });
});
