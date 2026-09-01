import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "../helpers/composedHost";
import { clearTemplateCache, isStaticTemplate, _templateCacheSize } from "../../src/core/translate";
import { parsePluralChoices, icuCompiler } from "../../src/core/translate/compile-icu";
import { effectiveExtBits, getCompilerId } from "../../src/core/translate/syntax";

// The composed-host helper registers tag syntax ambiently and wires the ICU
// compiler, so the cache variant its instances use — `rootVariant` below — is
// (icu, ambient bits).
const rootVariant = () => [getCompilerId(icuCompiler), effectiveExtBits()] as const;

// The template cache is MODULE-level, so it must be reset between tests.
beforeEach(() => {
  clearTemplateCache();
});

// Mirrors `TEMPLATE_CACHE_MAX` in src/core/translate.ts; eviction is FIFO with
// one delete per insert past the cap, so the size settles exactly at the cap.
const CACHE_MAX = 1000;
const OVER_CAP = CACHE_MAX + 50;
const HOT_KEY = `key_${OVER_CAP - 1}`;

describe("templateCache eviction", () => {
  // needs-seam: "the entry was REUSED, not rebuilt" has no public observable —
  // `isStaticTemplate` is the only window onto the cached verdict.
  it("reuses the context-tagged cache entry across repeated renders of a static template", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello world" } },
    });
    const [compilerId, extBits] = rootVariant();
    expect(isStaticTemplate("Hello world", false, compilerId, extBits)).toBeUndefined();
    expect(i18n.t("greeting" as never)).toBe("Hello world");
    expect(isStaticTemplate("Hello world", false, compilerId, extBits)).toBe(true);

    const repeated = i18n.t("greeting" as never);

    expect(repeated).toBe("Hello world");
    expect(isStaticTemplate("Hello world", false, compilerId, extBits)).toBe(true);
  });

  // Folded in from translate-cache-hit-eviction.test.ts, which duplicated this
  // file's cap constant and its insert-past-the-cap setup.
  it("re-rendering an already cached template evicts nothing", () => {
    const translations: Record<string, string> = {};
    for (let n = 0; n < OVER_CAP; n++) {
      translations[`key_${n}`] = `Value number ${n}`;
    }
    const i18n = createI18n({ locale: "en", translation: { en: translations } });
    // Per-call options skip the host's static fast path, so every call really
    // does reach the cache.
    for (let n = 0; n < OVER_CAP; n++) {
      i18n.t(`key_${n}` as never, { locale: "en" } as never);
    }

    i18n.t(HOT_KEY as never, { locale: "en" } as never);

    expect(_templateCacheSize()).toBe(CACHE_MAX);
  });

  it("keeps size at or below the cap after inserting many distinct templates", () => {
    const i18n = createI18n({ locale: "en" });
    const translations: Record<string, string> = {};
    // Enough distinct parametrized templates that eviction has to fire.
    for (let n = 0; n < OVER_CAP; n++) {
      translations[`key_${n}`] = `Value ${n} for {name}`;
    }
    i18n.addTranslations({ en: translations });

    for (let n = 0; n < OVER_CAP; n++) {
      i18n.t(`key_${n}` as never, { name: "World" } as never);
    }

    expect(_templateCacheSize()).toBe(CACHE_MAX);
  });

  it("static templates (no special chars) are also subject to the cap", () => {
    const i18n = createI18n({ locale: "en" });
    const translations: Record<string, string> = {};
    // Pure static strings (no {, ', <, &) — the fast path caches them too.
    for (let n = 0; n < OVER_CAP; n++) {
      translations[`static_${n}`] = `Hello world number ${n}`;
    }
    i18n.addTranslations({ en: translations });

    for (let n = 0; n < OVER_CAP; n++) {
      i18n.t(`static_${n}` as never);
    }

    expect(_templateCacheSize()).toBe(CACHE_MAX);
  });
});

describe("templateCache correctness after clearTranslations", () => {
  it("translates correctly after clearTranslations() + re-add", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ en: { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting" as never, { name: "Alice" } as never)).toBe("Hello, Alice!");

    i18n.clearTranslations();
    i18n.addTranslations({ en: { greeting: "Hello, {name}!" } });

    // Still compiled in the module-level cache, so translation must still work.
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

    const unmarkedChoices = parsePluralChoices(source, false);
    const markedChoices = parsePluralChoices(`\u0001${source}`, true);

    expect(markedChoices).toEqual({ other: "'#}'", another: "x" });
    expect(unmarkedChoices).toEqual({ other: "'#" });
    expect(markedChoices).not.toEqual(unmarkedChoices);
  });

  it("keeps plural-choice caches separate in the reverse insertion order", () => {
    const source = "other {'#}'} another {x}";

    const markedChoices = parsePluralChoices(`\u0001${source}`, true);
    const unmarkedChoices = parsePluralChoices(source, false);

    expect(markedChoices).toEqual({ other: "'#}'", another: "x" });
    expect(unmarkedChoices).toEqual({ other: "'#" });
    expect(unmarkedChoices).not.toEqual(markedChoices);
  });
});
