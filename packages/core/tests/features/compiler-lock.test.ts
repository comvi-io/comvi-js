import { describe, it, expect } from "vitest";
// The BASE host and the pure `/icu` subpath — never the internal composite and
// never the tags entry, so nothing configures a compiler behind these cases.
import { createI18n } from "../../src";
import { icu, icuCompiler, type CompilerLockedError } from "../../src/icu";
import { attachLoader } from "../../src/loader";
import { clearTemplateCache, _templateCacheSize } from "../../src/core/translate";
import { TK_TEXT } from "../../src/core/translate/cache";
import type { MessageCompiler } from "../../src/core/translate/syntax";

/**
 * The pre-ingestion compiler lock (plan §2.1b, P0.5).
 *
 * The base compiler is internally mutable through EXACTLY one pinned seam,
 * `I18nInternal._setCompilerBeforeIngestion`, and only while no catalog has
 * reached the host. `.with(icu())` is that seam's only public caller. The lock
 * is irreversible, which is precisely why the contract owes no cache
 * invalidation: if no catalog was ever ingested, no compiled template for this
 * host can exist.
 *
 * Two recipes, both pinned below:
 *   • inline catalogs  — `createI18n({ translation, compiler: icuCompiler })`
 *   • remote catalogs  — `createI18n({ locale }).with(icu()).with(loader…)`
 */

const PLURAL = "{count, plural, one {# item} other {# items}}";

/** A compiler that counts its parses, so a cache re-parse becomes observable. */
function countingCompiler(): { compiler: MessageCompiler; parses: () => number } {
  let parses = 0;
  return {
    // No `cid`: an explicit id is returned verbatim by `getCompilerId`, so two
    // custom compilers declaring the same one would legitimately SHARE cache
    // entries. Omitting it exercises the WeakMap path the contract relies on.
    compiler: {
      makeArgToken(content) {
        parses++;
        return [TK_TEXT, `«${content.trim().split(",")[0]}»`];
      },
    },
    parses: () => parses,
  };
}

describe("compiler lock — the two supported recipes", () => {
  it("inline: the constructor option compiles ICU from a constructor catalog", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: PLURAL } },
    });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 5 } as never)).toBe("5 items");
  });

  it("remote: .with(icu()) on an empty host, then ingest", () => {
    const i18n = createI18n({ locale: "en" }).with(icu());
    i18n.addTranslations({ en: { items: PLURAL } });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe("2 items");
  });

  it("repeated pre-ingestion installs are idempotent", () => {
    const i18n = createI18n({ locale: "en" }).with(icu()).with(icu()).with(icu());
    i18n.addTranslations({ en: { items: PLURAL } });

    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
  });

  it("accepts a custom compiler through the installer and through the option", () => {
    const a = countingCompiler();
    const viaInstaller = createI18n({ locale: "en" }).with(icu(a.compiler));
    viaInstaller.addTranslations({ en: { items: PLURAL } });
    expect(viaInstaller.t("items" as never, { count: 1 } as never)).toBe("«count»");

    const b = countingCompiler();
    const viaOption = createI18n({
      locale: "en",
      compiler: b.compiler,
      translation: { en: { items: PLURAL } },
    });
    expect(viaOption.t("items" as never, { count: 1 } as never)).toBe("«count»");
  });
});

describe("compiler lock — every ingestion seam locks, irreversibly", () => {
  /** Every case here asserts the SAME structured failure. */
  function expectLocked(run: () => unknown): CompilerLockedError {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "expected E_COMPILER_LOCKED").toBeInstanceOf(Error);
    expect((thrown as CompilerLockedError).code).toBe("E_COMPILER_LOCKED");
    return thrown as CompilerLockedError;
  }

  it("a constructor catalog locks the host", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
    expectLocked(() => i18n.with(icu()));
  });

  it("addTranslations locks the host", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ en: { hi: "Hi" } });
    expectLocked(() => i18n.with(icu()));
  });

  it("an EMPTY addTranslations locks the host too", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({});
    expectLocked(() => i18n.with(icu()));
  });

  it("a loader merge locks the host", async () => {
    const i18n = attachLoader(createI18n({ locale: "en" }));
    i18n.registerLoader(async () => ({ hi: "Hi" }));
    await i18n.init();

    expectLocked(() => i18n.with(icu()));
  });

  it("a catalog that FAILS the dev preflight still leaves the host locked", () => {
    const i18n = createI18n({ locale: "en" });

    // The lock is the FIRST statement of the ingestion seam, before the dev
    // preflight can throw — so a rejected catalog cannot reopen the compiler.
    expect(() => i18n.addTranslations({ en: { items: PLURAL } })).toThrow(/E_ICU_SYNTAX|ICU/);
    expectLocked(() => i18n.with(icu()));
  });

  it("clearTranslations does NOT unlock", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
    i18n.clearTranslations();
    expectLocked(() => i18n.with(icu()));

    i18n.clearTranslations("en");
    expectLocked(() => i18n.with(icu()));
  });

  it("the rejected install leaves the compiler untouched — the host stays loud", () => {
    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
    expectLocked(() => i18n.with(icu()));

    // Still the simple compiler: an ICU catalog is rejected exactly as before.
    let thrown: unknown;
    try {
      i18n.addTranslations({ en: { items: PLURAL } });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
  });
});

describe("compiler lock — the cache contract it buys", () => {
  it("swapping the compiler pre-ingestion touches neither cache identity nor revision", () => {
    const i18n = createI18n({ locale: "en" });
    const cache = i18n.translationCache;
    const revision = cache.getRevision();

    i18n.with(icu());

    expect(i18n.translationCache).toBe(cache);
    expect(cache.getRevision()).toBe(revision);
  });

  it("templates stay keyed per compiler id — two hosts, one string, two semantics", () => {
    clearTemplateCache();
    const before = _templateCacheSize();

    const simple = createI18n({ locale: "en", translation: { en: { plain: "a {x} b" } } });
    const icuHost = createI18n({ locale: "en" }).with(icu());
    icuHost.addTranslations({ en: { plain: "a {x} b" } });

    expect(simple.t("plain" as never, { x: 1 } as never)).toBe("a 1 b");
    expect(icuHost.t("plain" as never, { x: 1 } as never)).toBe("a 1 b");
    // One template string, two compiler ids ⇒ two independent cache entries.
    expect(_templateCacheSize()).toBe(before + 2);
  });

  it("a swap on one host never evicts, clears or rekeys another host's entry", () => {
    clearTemplateCache();
    const a = countingCompiler();

    // A per-call `fallback` really does compile (it goes through
    // translateTemplate), so this proves a cache entry EXISTS before the swap.
    const hostA = createI18n({ locale: "en", compiler: a.compiler });
    hostA.addTranslations({ en: {} });
    expect(hostA.t("absent" as never, { fallback: "pre {x}" } as never)).toBe("pre «x»");
    const parsesAfterFirstRender = a.parses();
    expect(parsesAfterFirstRender).toBeGreaterThan(0);

    // Another host swaps its compiler in. A clearTemplateCache(), an eviction
    // or a rekey anywhere on that path would force host A to re-parse.
    const hostB = createI18n({ locale: "en" }).with(icu());
    hostB.addTranslations({ en: { items: PLURAL } });
    expect(hostB.t("items" as never, { count: 3 } as never)).toBe("3 items");

    expect(hostA.t("absent" as never, { fallback: "pre {x}" } as never)).toBe("pre «x»");
    expect(a.parses()).toBe(parsesAfterFirstRender);
  });

  it("two distinct custom compilers each keep their own variant of one string", () => {
    clearTemplateCache();
    const a = countingCompiler();
    const b = countingCompiler();

    const hostA = createI18n({ locale: "en", compiler: a.compiler });
    const hostB = createI18n({ locale: "en", compiler: b.compiler });
    hostA.addTranslations({ en: { items: PLURAL } });
    hostB.addTranslations({ en: { items: PLURAL } });

    expect(hostA.t("items" as never, { count: 1 } as never)).toBe("«count»");
    expect(hostB.t("items" as never, { count: 1 } as never)).toBe("«count»");
    // Distinct WeakMap-backed ids ⇒ no shared entry, so BOTH compilers parsed.
    expect(a.parses()).toBeGreaterThan(0);
    expect(b.parses()).toBeGreaterThan(0);
  });
});

describe("compiler lock — ordering against the loader", () => {
  it("icu() before the first catalog is the working remote recipe", async () => {
    const i18n = attachLoader(createI18n({ locale: "en" }).with(icu()));
    i18n.registerLoader(async () => ({ items: PLURAL }));
    await i18n.init();

    expect(i18n.t("items" as never, { count: 4 } as never)).toBe("4 items");
  });

  it("icu() AFTER the loader merged throws instead of silently working", async () => {
    const i18n = attachLoader(createI18n({ locale: "en" }));
    i18n.registerLoader(async () => ({ hi: "Hi" }));
    await i18n.init();

    expect(() => i18n.with(icu())).toThrow(/E_COMPILER_LOCKED|catalog was ingested/);
  });
});
