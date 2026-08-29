import { describe, it, expect, beforeEach, afterEach } from "vitest";
// Internals imported directly — never "../../src/tags" and never the
// composed-host helper — so nothing registers the tag extension ambiently
// behind these counts.
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache, _templateCacheSize } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import {
  _resetSyntaxExtensions,
  getAmbientExtensions,
  type MessageCompiler,
} from "../../src/core/translate/syntax";
import { prepareTranslation } from "../../src/core/prepareTranslation";

/**
 * The deterministic replacement for the retired `scripts/perf.mjs` CI gate (the script
 * survives as a manual tool).
 * Every case here counts the work that must NOT happen on a hot path —
 * template parses, template-cache entries, ambient registrations — instead of
 * timing 0.12 µs operations, so a lost fast path or a broken cache key fails
 * loudly rather than drowning in benchmark noise.
 */

/** Repetitions per hot-path case: any re-parse per call turns 1 into this. */
const HOT_CALLS = 50;

const STATIC_TEMPLATE = "Static text number 0";
const PARAM_TEMPLATE = "Hello, {name}!";
const SECOND_PARAM_TEMPLATE = "Goodbye, {name}.";
const PLURAL_TEMPLATE = "{count, plural, one {# item} other {# items}}";
const RICH_TEMPLATE = "Click <b>here</b> for {what}";

/**
 * Counts `makeArgToken` calls — one per `{…}` argument per PARSE — while
 * delegating to the real compiler, so rendered output stays production-faithful.
 *
 * Deliberately declares no `cid`: the shim takes its own WeakMap-backed
 * compiler id (hence its own template-cache variant), and because it is not
 * `simpleCompiler` by identity it also skips the dev-only ingestion preflight,
 * which would otherwise parse a whole catalog eagerly and hide construction
 * laziness.
 */
function countingShim(base: MessageCompiler): {
  compiler: MessageCompiler;
  parses: () => number;
} {
  let parses = 0;
  return {
    compiler: {
      makeArgToken(content, hashIsSyntax, template) {
        parses++;
        return base.makeArgToken(content, hashIsSyntax, template);
      },
      argOpensHashScope: base.argOpensHashScope,
      processArgToken: base.processArgToken,
    },
    parses: () => parses,
  };
}

/** The 200-key catalog `scripts/perf.mjs` constructed over, shape for shape. */
function bigCatalog(): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (let i = 0; i < 200; i++) {
    catalog[`key${i}`] = i % 3 ? `Hello, {name}! Item ${i}` : `Static text number ${i}`;
  }
  return catalog;
}

function makeHost(compiler: MessageCompiler, translations: Record<string, string>): I18n {
  const i18n = new I18n({ locale: "en", exposeGlobal: false }, compiler);
  i18n.addTranslations({ en: translations });
  return i18n;
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("construction laziness", () => {
  it("a host built over a 200-key catalog → 0 parses and 0 cache entries", () => {
    const { compiler, parses } = countingShim(simpleCompiler);

    makeHost(compiler, bigCatalog());

    expect(parses()).toBe(0);
    expect(_templateCacheSize()).toBe(0);
  });

  it("a host built over a 200-key catalog with the shipped default compiler → 0 cache entries", () => {
    // In development `simpleCompiler` catalogs DO get parsed at ingestion (the
    // eager E_ICU_SYNTAX preflight); this pins that those parses never reach
    // the shared template cache, so first render still populates it.
    makeHost(simpleCompiler, bigCatalog());

    expect(_templateCacheSize()).toBe(0);
  });
});

describe("t() on a static template", () => {
  it("called 50 times on a placeholder-free template → 0 parses and 1 cache entry", () => {
    const { compiler, parses } = countingShim(simpleCompiler);
    const i18n = makeHost(compiler, { plain: STATIC_TEMPLATE });

    const results: string[] = [];
    for (let call = 0; call < HOT_CALLS; call++) results.push(i18n.t("plain" as never));

    expect(results).toEqual(Array<string>(HOT_CALLS).fill(STATIC_TEMPLATE));
    expect(parses()).toBe(0);
    expect(_templateCacheSize()).toBe(1);
  });
});

describe("t() on a {name} template", () => {
  it("called 50 times with a different value each time → exactly 1 parse and 1 cache entry", () => {
    const { compiler, parses } = countingShim(simpleCompiler);
    const i18n = makeHost(compiler, { greeting: PARAM_TEMPLATE });

    const results: string[] = [];
    for (let call = 0; call < HOT_CALLS; call++) {
      results.push(i18n.t("greeting" as never, { name: `user${call}` } as never));
    }

    expect(results[0]).toBe("Hello, user0!");
    expect(results[HOT_CALLS - 1]).toBe(`Hello, user${HOT_CALLS - 1}!`);
    expect(parses()).toBe(1);
    expect(_templateCacheSize()).toBe(1);
  });

  it("called on a second, distinct template → exactly 1 further parse and 1 further cache entry", () => {
    const { compiler, parses } = countingShim(simpleCompiler);
    const i18n = makeHost(compiler, {
      greeting: PARAM_TEMPLATE,
      farewell: SECOND_PARAM_TEMPLATE,
    });

    for (let call = 0; call < HOT_CALLS; call++) {
      i18n.t("greeting" as never, { name: "Ada" } as never);
    }
    for (let call = 0; call < HOT_CALLS; call++) {
      i18n.t("farewell" as never, { name: "Ada" } as never);
    }

    expect(parses()).toBe(2);
    expect(_templateCacheSize()).toBe(2);
  });
});

describe("t() on an ICU plural", () => {
  it("called 50 times with a varying count → exactly 1 parse and 1 cache entry", () => {
    const { compiler, parses } = countingShim(icuCompiler);
    const i18n = makeHost(compiler, { items: PLURAL_TEMPLATE });

    const results: string[] = [];
    for (let call = 1; call <= HOT_CALLS; call++) {
      results.push(i18n.t("items" as never, { count: call } as never));
    }

    expect(results[0]).toBe("1 item");
    expect(results[HOT_CALLS - 1]).toBe(`${HOT_CALLS} items`);
    expect(parses()).toBe(1);
    expect(_templateCacheSize()).toBe(1);
  });
});

describe("prepareTranslation on a rich-text template", () => {
  it("called 50 times over a <b> template → exactly 1 parse, 1 cache entry and 0 ambient registrations", () => {
    // The 0 ambient registrations is the load-bearing half: `@comvi/core/rich-text`
    // hands the tag grammar over per call, so registration must not scale with
    // call count (and must never become a module side effect).
    const { compiler, parses } = countingShim(simpleCompiler);
    const i18n = makeHost(compiler, { rich: RICH_TEMPLATE });

    const results: unknown[] = [];
    for (let call = 0; call < HOT_CALLS; call++) {
      results.push(
        prepareTranslation(i18n, {
          i18nKey: "rich",
          params: { what: "docs" },
          components: { b: "strong" },
        }).content,
      );
    }

    expect(results[HOT_CALLS - 1]).toEqual([
      "Click ",
      { type: "element", tag: "strong", props: {}, children: ["here"] },
      " for docs",
    ]);
    expect(parses()).toBe(1);
    expect(_templateCacheSize()).toBe(1);
    expect(getAmbientExtensions().length).toBe(0);
  });
});

describe("template cache sharing between hosts", () => {
  it("two hosts sharing one compiler render one template → exactly 1 parse and 1 cache entry", () => {
    const { compiler, parses } = countingShim(simpleCompiler);
    const first = makeHost(compiler, { greeting: PARAM_TEMPLATE });
    const second = makeHost(compiler, { greeting: PARAM_TEMPLATE });

    const firstResult = first.t("greeting" as never, { name: "Ada" } as never);
    const secondResult = second.t("greeting" as never, { name: "Grace" } as never);

    expect(firstResult).toBe("Hello, Ada!");
    expect(secondResult).toBe("Hello, Grace!");
    expect(parses()).toBe(1);
    expect(_templateCacheSize()).toBe(1);
  });
});
