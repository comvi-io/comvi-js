import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "../../src";
import { clearTemplateCache, isStaticTemplate, _templateCacheSize } from "../../src/core/translate";
import { parsePluralChoices } from "../../src/core/translate/parser";

// Reset the module-level template cache before each test so tests are isolated.
beforeEach(() => {
  clearTemplateCache();
});

describe("templateCache eviction", () => {
  it("reuses the context-tagged cache entry for plain static templates", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello world" } },
    });

    expect(isStaticTemplate("Hello world")).toBeUndefined();
    expect(i18n.t("greeting" as never)).toBe("Hello world");
    expect(isStaticTemplate("Hello world")).toBe(true);
    expect(i18n.t("greeting" as never)).toBe("Hello world");
    expect(isStaticTemplate("Hello world")).toBe(true);
  });

  it("keeps size at or below the cap after inserting many distinct templates", () => {
    const i18n = createI18n({ locale: "en" });
    const translations: Record<string, string> = {};
    // Insert TEMPLATE_CACHE_MAX + 50 distinct parametrized templates so eviction fires.
    const total = 1050;
    for (let n = 0; n < total; n++) {
      translations[`key_${n}`] = `Value ${n} for {name}`;
    }
    i18n.addTranslations({ en: translations });

    for (let n = 0; n < total; n++) {
      i18n.t(`key_${n}` as never, { name: "World" } as never);
    }

    expect(_templateCacheSize()).toBeLessThanOrEqual(1000);
  });

  it("static templates (no special chars) are also subject to the cap", () => {
    clearTemplateCache();
    const i18n = createI18n({ locale: "en" });
    const translations: Record<string, string> = {};
    // Pure static strings (no {, ', <, &) — the fast-path caches them too.
    for (let n = 0; n < 1050; n++) {
      translations[`static_${n}`] = `Hello world number ${n}`;
    }
    i18n.addTranslations({ en: translations });

    for (let n = 0; n < 1050; n++) {
      i18n.t(`static_${n}` as never);
    }

    expect(_templateCacheSize()).toBeLessThanOrEqual(1000);
  });
});

describe("templateCache correctness after clearTranslations", () => {
  it("translates correctly after clearTranslations() + re-add", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ en: { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting" as never, { name: "Alice" } as never)).toBe("Hello, Alice!");

    i18n.clearTranslations();
    i18n.addTranslations({ en: { greeting: "Hello, {name}!" } });

    // Template is still compiled in the module-level cache; translation must still work.
    expect(i18n.t("greeting" as never, { name: "Bob" } as never)).toBe("Hello, Bob!");
  });

  it("returns updated translation value after clearTranslations() + re-add with new text", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ en: { msg: "Old {value}" } });

    expect(i18n.t("msg" as never, { value: "text" } as never)).toBe("Old text");

    i18n.clearTranslations();
    i18n.addTranslations({ en: { msg: "New {value}" } });

    expect(i18n.t("msg" as never, { value: "text" } as never)).toBe("New text");
  });
});

describe("templateCache cross-instance isolation", () => {
  it("destroying instance A does not break translation on instance B", async () => {
    const key = "shared" as never;
    const params = { count: 42 } as never;
    const template = "Count is {count}";
    const expected = "Count is 42";

    const i18nA = createI18n({ locale: "en" });
    const i18nB = createI18n({ locale: "en" });

    i18nA.addTranslations({ en: { shared: template } });
    i18nB.addTranslations({ en: { shared: template } });

    // Populate the shared template cache from both instances.
    expect(i18nA.t(key, params)).toBe(expected);
    expect(i18nB.t(key, params)).toBe(expected);

    // Destroying A must NOT wipe the module-level template cache.
    await i18nA.destroy();

    expect(i18nB.t(key, params)).toBe(expected);
  });

  it("clearTranslations() on instance A does not break instance B", () => {
    const key = "hello" as never;
    const template = "Hi {name}";

    const i18nA = createI18n({ locale: "en" });
    const i18nB = createI18n({ locale: "en" });

    i18nA.addTranslations({ en: { hello: template } });
    i18nB.addTranslations({ en: { hello: template } });

    i18nA.t(key, { name: "X" } as never);
    i18nB.t(key, { name: "Y" } as never);

    i18nA.clearTranslations();

    // B still has its translation data and the template cache should be intact.
    expect(i18nB.t(key, { name: "Z" } as never)).toBe("Hi Z");
  });
});

describe("context-sensitive cache keys", () => {
  it("does not collide with a top-level template that starts with the context marker", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          plural: "{count, plural, other {'#'}}",
          topLevel: "\u0001'#'",
        },
      },
    });

    expect(i18n.t("plural" as never, { count: 2 } as never)).toBe("#");
    expect(i18n.t("topLevel" as never)).toBe("\u0001'#'");
  });

  it("does not collide when the marker-prefixed top-level template is cached first", () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: {
          topLevel: "\u0001'#'",
          plural: "{count, plural, other {'#'}}",
        },
      },
    });

    expect(i18n.t("topLevel" as never)).toBe("\u0001'#'");
    expect(i18n.t("plural" as never, { count: 2 } as never)).toBe("#");
  });

  it("keeps plural-choice caches separate when source text starts with the context marker", () => {
    const source = "other {'#}'} another {x}";
    clearTemplateCache();
    const expectedMarkedChoices = parsePluralChoices(`\u0001${source}`, true);

    clearTemplateCache();
    const unmarkedChoices = parsePluralChoices(source, false);
    const markedChoices = parsePluralChoices(`\u0001${source}`, true);

    expect(markedChoices).toEqual(expectedMarkedChoices);
    expect(markedChoices).not.toEqual(unmarkedChoices);
  });

  it("keeps plural-choice caches separate in the reverse insertion order", () => {
    const source = "other {'#}'} another {x}";
    clearTemplateCache();
    const expectedUnmarkedChoices = parsePluralChoices(source, false);

    clearTemplateCache();
    const markedChoices = parsePluralChoices(`\u0001${source}`, true);
    const unmarkedChoices = parsePluralChoices(source, false);

    expect(unmarkedChoices).toEqual(expectedUnmarkedChoices);
    expect(unmarkedChoices).not.toEqual(markedChoices);
  });
});
