import { describe, it, expect, beforeEach } from "vitest";
// The BASE host and the pure `/icu` subpath — never the internal composite and
// never the tags entry, so nothing configures a compiler behind these cases.
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/icu";
import { attachLoader } from "../../src/loader";
import { clearTemplateCache } from "../../src/core/translate";
import { countingCompiler } from "../helpers/compilers";

/**
 * `compiler` is the ONE way to choose a message compiler, and it is a
 * constructor option — so it applies to every catalog this host ingests,
 * whatever the source: a constructor `translation`, an `addTranslations` call
 * or a loader merge. There is no installer and no ordering rule.
 *
 * The cases below also pin the cache contract the option buys: compiled
 * templates are keyed per compiler id, so one string can carry two semantics
 * across two hosts without either host re-parsing the other's entry.
 */

const PLURAL = "{count, plural, one {# item} other {# items}}";

beforeEach(() => {
  clearTemplateCache();
});

describe("compiler option — every catalog source", () => {
  it("compiles ICU from a constructor catalog", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: PLURAL } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 5 } as never)).toBe("5 items");
  });

  it("compiles ICU from an addTranslations catalog", () => {
    const i18n = createI18n({ locale: "en", compiler: icuCompiler });
    i18n.addTranslations({ en: { items: PLURAL } });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe("2 items");
  });

  it("compiles ICU from a loader merge", async () => {
    const i18n = attachLoader(createI18n({ locale: "en", compiler: icuCompiler }));
    i18n.registerLoader(async () => ({ items: PLURAL }));
    await i18n.init();

    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("survives a catalog ingested AFTER the loader merged", async () => {
    const i18n = attachLoader(createI18n({ locale: "en", compiler: icuCompiler }));
    i18n.registerLoader(async () => ({ hi: "Hi" }));
    await i18n.init();

    // Nothing locks: a second, later catalog compiles under the same compiler.
    i18n.addTranslations({ en: { items: PLURAL } });
    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 items");
  });

  it("accepts a custom compiler", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: countingCompiler().compiler,
      translation: { en: { items: PLURAL } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("«count»");
  });

  it("defaults to the simple compiler, which stays loud about ICU syntax", () => {
    const i18n = createI18n({ locale: "en" });

    expect(() => i18n.addTranslations({ en: { items: PLURAL } })).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });
});

describe("compiler option — the cache contract", () => {
  it("templates stay keyed per compiler id — two hosts, one string, two semantics", () => {
    const custom = countingCompiler();

    const customHost = createI18n({
      locale: "en",
      compiler: custom.compiler,
      translation: { en: { plain: "a {x} b" } },
    });
    const icuHost = createI18n({ locale: "en", compiler: icuCompiler });
    icuHost.addTranslations({ en: { plain: "a {x} b" } });

    // The ICU host compiles the shared string FIRST. One entry keyed on the
    // string alone would then be handed to the custom host, which would render
    // "a 1 b" without ever parsing.
    expect(icuHost.t("plain" as never, { x: 1 } as never)).toBe("a 1 b");

    expect(customHost.t("plain" as never, { x: 1 } as never)).toBe("a «x» b");
    expect(custom.parses()).toBe(1);
  });

  it("one host's compiler never evicts, clears or rekeys another host's entry", () => {
    const a = countingCompiler();

    // A per-call `fallback` really does compile, so this proves a cache entry
    // EXISTS before the second host appears.
    const hostA = createI18n({ locale: "en", compiler: a.compiler });
    hostA.addTranslations({ en: {} });
    expect(hostA.t("absent" as never, { fallback: "pre {x}" } as never)).toBe("pre «x»");
    const parsesAfterFirstRender = a.parses();
    expect(parsesAfterFirstRender).toBe(1);

    // Another host compiles under a different compiler. A clearTemplateCache(),
    // an eviction or a rekey anywhere on that path would force host A to
    // re-parse.
    const hostB = createI18n({ locale: "en", compiler: icuCompiler });
    hostB.addTranslations({ en: { items: PLURAL } });
    expect(hostB.t("items" as never, { count: 3 } as never)).toBe("3 items");

    expect(hostA.t("absent" as never, { fallback: "pre {x}" } as never)).toBe("pre «x»");
    expect(a.parses()).toBe(parsesAfterFirstRender);
  });

  it("two distinct custom compilers each keep their own variant of one string", () => {
    const a = countingCompiler();
    const b = countingCompiler();

    const hostA = createI18n({ locale: "en", compiler: a.compiler });
    const hostB = createI18n({ locale: "en", compiler: b.compiler });
    hostA.addTranslations({ en: { items: PLURAL } });
    hostB.addTranslations({ en: { items: PLURAL } });

    expect(hostA.t("items" as never, { count: 1 } as never)).toBe("«count»");
    expect(hostB.t("items" as never, { count: 1 } as never)).toBe("«count»");
    // Distinct WeakMap-backed ids ⇒ no shared entry, so BOTH compilers parsed.
    expect([a.parses(), b.parses()]).toEqual([1, 1]);
  });

  it("clearTranslations leaves the compiler in place", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: PLURAL } },
    });
    i18n.clearTranslations();

    i18n.addTranslations({ en: { items: PLURAL } });
    expect(i18n.t("items" as never, { count: 7 } as never)).toBe("7 items");
  });
});
