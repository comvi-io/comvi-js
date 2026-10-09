/**
 * An empty string is a value nobody has written yet — what a translation
 * platform publishes for an untranslated key. It counts as missing everywhere a
 * key is looked up: `t()` walks the fallback chain past it, and a key empty in
 * every locale takes the missing-key path. Only the STORED value is judged: a
 * message that has text and renders empty for one call is a translation.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/icu";

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

  it("empty in every locale of the chain → the key, as for a key missing everywhere", () => {
    const onMissingKey = vi.fn();
    const i18n = make({ de: { title: "" }, fr: { title: "" }, en: { title: "" } }, onMissingKey);

    expect(i18n.t("title")).toBe("title");
    expect(onMissingKey).toHaveBeenCalledWith({ key: "title", locale: "de", namespace: "default" });
  });

  it("empty everywhere with a per-call fallback → the fallback text", () => {
    const i18n = make({ de: { title: "" }, en: { title: "" } });

    expect(i18n.t("title", { fallback: "Untitled" })).toBe("Untitled");
  });

  it("empty with no fallback chain → the key", () => {
    const i18n = createI18n({ locale: "de", exposeGlobal: false, messages: { de: { title: "" } } });

    expect(i18n.t("title")).toBe("title");
  });

  it("text in the locale → the fallback is not consulted", () => {
    const i18n = make({ de: { title: "Titel" }, en: { title: "Title" } });

    expect(i18n.t("title")).toBe("Titel");
  });
});

describe("hasTranslation() with an empty translation", () => {
  it("empty in the locale → false", () => {
    const i18n = make({ de: { title: "" }, en: { title: "Title" } });

    expect(i18n.hasTranslation("title")).toBe(false);
  });

  it("empty in the locale, text in a fallback, checkFallbacks → true", () => {
    const i18n = make({ de: { title: "" }, en: { title: "Title" } });

    expect(i18n.hasTranslation("title", undefined, undefined, true)).toBe(true);
  });

  it("empty in every locale, checkFallbacks → false", () => {
    const i18n = make({ de: { title: "" }, en: { title: "" } });

    expect(i18n.hasTranslation("title", undefined, undefined, true)).toBe(false);
  });
});

describe("a message whose text is there but renders empty", () => {
  const messages = {
    de: {
      items: "{count, plural, =0 {} other {# Artikel}}",
      tone: "{kind, select, quiet {} other {Hallo}}",
    },
    en: { items: "{count, plural, other {# items}}", tone: "Hello" },
  };
  const makeIcu = () =>
    createI18n({
      locale: "de",
      fallbackLocale: "en",
      exposeGlobal: false,
      compiler: icuCompiler,
      messages,
    });

  it("plural branch written empty → the empty string, the fallback is not consulted", () => {
    expect(makeIcu().t("items", { count: 0 })).toBe("");
  });

  it("select branch written empty → the empty string, the fallback is not consulted", () => {
    expect(makeIcu().t("tone", { kind: "quiet" })).toBe("");
  });

  it("a param that renders empty → the rest of the message, not the fallback", () => {
    const i18n = make({ de: { hi: "{name}" }, en: { hi: "Hi {name}" } });

    expect(i18n.t("hi", { name: "" })).toBe("");
  });
});
