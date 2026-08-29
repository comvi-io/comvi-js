import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "../../src";
import { clearTemplateCache } from "../../src/core/translate";

// Regression: the static-template cache entry written by t() is a token-less placeholder; the
// per-call `fallback` path used to render that entry through the token path and produce "".
describe("t() with params.fallback that equals an already-rendered static template", () => {
  beforeEach(clearTemplateCache);

  it("renders the fallback text after the same text was rendered from the catalog → 'Hello world'", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { greet: "Hello world" } } });
    i18n.t("greet");

    const rendered = i18n.t("missing", { fallback: "Hello world" });

    expect(rendered).toBe("Hello world");
  });

  it("renders the catalog value after the same text was used as a fallback first → 'Hello world'", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { greet: "Hello world" } } });
    i18n.t("missing", { fallback: "Hello world" });

    const rendered = i18n.t("greet");

    expect(rendered).toBe("Hello world");
  });

  it("still interpolates a fallback template that has a parameter → 'Hi Ann'", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi {name}" } } });
    i18n.t("hi", { name: "Bob" });

    const rendered = i18n.t("missing", { fallback: "Hi {name}", name: "Ann" });

    expect(rendered).toBe("Hi Ann");
  });
});
