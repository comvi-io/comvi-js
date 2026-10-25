import { describe, it, expect, beforeEach, afterEach } from "vitest";
// Internals imported directly — never "../../src/tags" — so nothing registers
// the tag extension ambiently behind these counts.
import { I18n } from "../../src/core/i18n";
import {
  clearTemplateCache,
  isStaticTemplate,
  translate,
  translateTemplate,
  _templateCacheSize,
  _templatePartitionCount,
} from "../../src/core/translate";
import { TK_TEXT } from "../../src/core/translate/cache";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import { registerTagSyntax, tagSyntaxExtension } from "../../src/core/translate/tags";
import {
  _resetSyntaxExtensions,
  effectiveExtBits,
  getCompilerId,
  registerSyntaxExtension,
  type MessageCompiler,
  type SyntaxExtension,
} from "../../src/core/translate/syntax";
import type { TagInterpolationOptions } from "../../src/types";

/**
 * The template cache is partitioned by (compilerId, extBits, hashIsSyntax) and
 * bounded by ONE global FIFO ring of 1000 entries. Eviction has no public
 * observable, so it is asserted by counting parses: a compiler spy counts
 * `makeArgToken` calls, one per `{…}` argument per PARSE, so a re-render that
 * parses again is a re-render whose entry was evicted.
 */

/** Mirrors `TEMPLATE_CACHE_MAX` in src/core/translate.ts. */
const CACHE_MAX = 1000;

/** Counts parses while delegating to `simpleCompiler`; `cid` pins its partition. */
function spyCompiler(cid?: number): { compiler: MessageCompiler; parses: () => number } {
  let parses = 0;
  return {
    compiler: {
      ...(cid === undefined ? {} : { cid }),
      makeArgToken(content, hashIsSyntax, template) {
        parses++;
        return simpleCompiler.makeArgToken(content, hashIsSyntax, template);
      },
    },
    parses: () => parses,
  };
}

/** One `{x}` argument per template, so every parse counts exactly once. */
const tpl = (tag: string, i: number) => `${tag} ${i} {x}`;

function render(
  compiler: MessageCompiler,
  template: string,
  tagInterpolation?: TagInterpolationOptions,
  hashIsSyntax = false,
) {
  return translateTemplate(
    template,
    { x: "v" },
    "en",
    tagInterpolation,
    compiler,
    "literal",
    hashIsSyntax,
  );
}

function fill(compiler: MessageCompiler, tag: string, from: number, to: number): void {
  for (let i = from; i < to; i++) render(compiler, tpl(tag, i));
}

function inertExtension(id: string, cacheBit: number): SyntaxExtension {
  return { id, cacheBit, parseHook: () => undefined, processHook: () => undefined };
}

const bold = ({ children }: { children: unknown }) => `[${children}]`;

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("partition key", () => {
  it("1. keeps # as text at the top level and as the count inside a plural, in either order", () => {
    const TOP = "# items {n}";
    const PLURAL = "{c, plural, other {# items {n}}}";
    const params = { c: 3, n: 5 };

    expect(translate(TOP, "en", params, undefined, icuCompiler)).toBe("# items 5");
    expect(translate(PLURAL, "en", params, undefined, icuCompiler)).toBe("3 items 5");
    // The outer plural plus one entry per hash variant of the shared branch text.
    expect(_templateCacheSize()).toBe(3);

    clearTemplateCache();

    expect(translate(PLURAL, "en", params, undefined, icuCompiler)).toBe("3 items 5");
    expect(translate(TOP, "en", params, undefined, icuCompiler)).toBe("# items 5");
    expect(_templateCacheSize()).toBe(3);
  });

  it("2. keeps two injected compilers and both built-ins apart", () => {
    const tagged = (name: string): MessageCompiler => ({
      makeArgToken: (content) => [TK_TEXT, name + ":" + content],
    });
    const [a, b] = [tagged("A"), tagged("B")];

    const out = () => [
      render(a, "{x}"),
      render(b, "{x}"),
      render(simpleCompiler, "{x}"),
      render(icuCompiler, "{x}"),
    ];

    expect(out()).toEqual(["A:x", "B:x", "v", "v"]);
    expect(out()).toEqual(["A:x", "B:x", "v", "v"]);
    expect(new Set([a, b, simpleCompiler, icuCompiler].map(getCompilerId)).size).toBe(4);
    expect(_templatePartitionCount()).toBe(4);
  });

  it("3. resolves ambient extension bits at call time, not at construction", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false }, icuCompiler);
    i18n.addMessages({ en: { msg: "<b>hi</b>" } });
    const t = () => i18n.t("msg" as never, { b: bold } as never);

    expect(t()).toBe("<b>hi</b>");
    const dispose = registerTagSyntax();
    expect(t()).toBe("[hi]");
    dispose();
    expect(t()).toBe("<b>hi</b>");
  });

  it("4. keys on the union of per-call and ambient bits; a per-call copy of an ambient one shares the entry", () => {
    const ambient = inertExtension("inert", 2);
    const disposeInert = registerSyntaxExtension(ambient);
    const AMP = "Tom & Jerry";
    const id = getCompilerId(simpleCompiler);

    translate(AMP, "en", undefined, { extensions: [tagSyntaxExtension] }, simpleCompiler);

    const union = ambient.cacheBit | tagSyntaxExtension.cacheBit;
    expect(effectiveExtBits([tagSyntaxExtension])).toBe(union);
    expect(isStaticTemplate(AMP, false, id, union)).toBe(true);
    expect(isStaticTemplate(AMP, false, id, ambient.cacheBit)).toBeUndefined();
    expect(isStaticTemplate(AMP, false, id, tagSyntaxExtension.cacheBit)).toBeUndefined();
    disposeInert();

    clearTemplateCache();
    registerTagSyntax();
    const { compiler, parses } = spyCompiler();
    const TAGGED = "<b>{x}</b>";

    const params = { x: "v", b: bold };
    const ambientOnly = translate(TAGGED, "en", params, undefined, compiler);
    const perCall = translate(TAGGED, "en", params, { extensions: [tagSyntaxExtension] }, compiler);

    expect(ambientOnly).toBe("[v]");
    expect(perCall).toBe("[v]");
    expect(parses()).toBe(1);
    expect(_templateCacheSize()).toBe(1);
  });

  it("5. withMessages overlays render static and param values; base and view never cross", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false }, simpleCompiler);
    i18n.addMessages({ en: { greeting: "Hello", farewell: "Bye {name}" } });
    const view = i18n.withMessages({
      "en:default": { greeting: "Hi", welcome: "Welcome {name}" },
    });

    expect(view.t("greeting" as never)).toBe("Hi");
    expect(view.t("welcome" as never, { name: "Ann" } as never)).toBe("Welcome Ann");
    expect(view.t("farewell" as never, { name: "Ann" } as never)).toBe("Bye Ann");

    i18n.addMessages({ en: { later: "Later {name}" } });

    expect(view.t("later" as never, { name: "Ann" } as never)).toBe("Later Ann");
    expect(i18n.t("greeting" as never)).toBe("Hello");
    expect(view.t("greeting" as never)).toBe("Hi");
    expect(i18n.t("greeting" as never)).toBe("Hello");
    expect(i18n.t("welcome" as never, { name: "Ann" } as never)).not.toBe("Welcome Ann");
  });
});

describe("global FIFO bound", () => {
  it("6. bounds entries across partitions: 600 + 600 keep 1000 and evict P1's oldest 200", () => {
    const p1 = spyCompiler(101);
    const p2 = spyCompiler(102);
    fill(p1.compiler, "p1", 0, 600);
    fill(p2.compiler, "p2", 0, 600);

    expect(_templateCacheSize()).toBe(CACHE_MAX);
    expect(_templatePartitionCount()).toBe(2);
    const before = p1.parses();
    // #200 is the oldest survivor: a hit, no parse.
    expect(render(p1.compiler, tpl("p1", 200))).toBe("p1 200 v");
    expect(p1.parses()).toBe(before);
    // #199 was evicted: it parses again and renders identically.
    expect(render(p1.compiler, tpl("p1", 199))).toBe("p1 199 v");
    expect(p1.parses()).toBe(before + 1);
    expect(render(p1.compiler, tpl("p1", 0))).toBe("p1 0 v");
    expect(p1.parses()).toBe(before + 2);
  });

  it("7. wraps around: 2500 distinct templates leave exactly the last 1000", () => {
    const { compiler, parses } = spyCompiler(103);
    fill(compiler, "w", 0, 2500);
    expect(_templateCacheSize()).toBe(CACHE_MAX);
    expect(parses()).toBe(2500);

    fill(compiler, "w", 1500, 2500);
    expect(parses()).toBe(2500);

    render(compiler, tpl("w", 1499));
    expect(parses()).toBe(2501);
    expect(_templateCacheSize()).toBe(CACHE_MAX);
  });

  it("8. hits never refresh order: a hot entry is still evicted at its FIFO turn", () => {
    const { compiler, parses } = spyCompiler(104);
    fill(compiler, "h", 0, CACHE_MAX);
    for (let i = 0; i < 50; i++) render(compiler, tpl("h", 0));
    expect(parses()).toBe(CACHE_MAX);

    render(compiler, tpl("h", CACHE_MAX));

    // #1 survived (a hit), the hot #0 did not (a parse).
    render(compiler, tpl("h", 1));
    expect(parses()).toBe(CACHE_MAX + 1);
    render(compiler, tpl("h", 0));
    expect(parses()).toBe(CACHE_MAX + 2);
  });

  it("9. a re-entrant duplicate insert at capacity overwrites in place and evicts nothing extra", () => {
    const { compiler, parses } = spyCompiler(105);
    const REENTRANT = "a <b> {x}";
    let fired = false;
    // One-shot seam: the first parse of REENTRANT renders the same template
    // (same compiler, same per-call extension, so the same partition) before
    // returning, so the inner miss inserts it and the outer insert finds it.
    const reentrant: SyntaxExtension = {
      id: "reentrant",
      cacheBit: 8,
      parseHook: (template, _index, _len, _hash, extensions, parseCompiler) => {
        if (!fired) {
          fired = true;
          translateTemplate(template, { x: "v" }, "en", { extensions }, parseCompiler);
        }
        return undefined;
      },
      processHook: () => undefined,
    };
    const perCall = { extensions: [reentrant] };
    fill(compiler, "r", 0, CACHE_MAX);
    expect(_templateCacheSize()).toBe(CACHE_MAX);

    expect(render(compiler, REENTRANT, perCall)).toBe("a <b> v");
    expect(fired).toBe(true);
    expect(parses()).toBe(CACHE_MAX + 2);
    expect(_templateCacheSize()).toBe(CACHE_MAX);

    // The inner insert evicted #0 only; #1 is still served.
    render(compiler, tpl("r", 1));
    expect(parses()).toBe(CACHE_MAX + 2);
    // And the re-entrant template itself is served from the cache.
    expect(render(compiler, REENTRANT, perCall)).toBe("a <b> v");
    expect(parses()).toBe(CACHE_MAX + 2);
  });
});

describe("bucket lifecycle", () => {
  it("10. evicting a partition's last entry drops its bucket; a later insert recreates it", () => {
    const p1 = spyCompiler(106);
    const p2 = spyCompiler(107);
    render(p1.compiler, tpl("p1", 0));
    fill(p2.compiler, "p2", 0, CACHE_MAX - 1);
    expect(_templatePartitionCount()).toBe(2);

    render(p2.compiler, tpl("p2", CACHE_MAX - 1));
    expect(_templatePartitionCount()).toBe(1);

    render(p1.compiler, tpl("p1", 1));
    expect(_templatePartitionCount()).toBe(2);
    const before = p1.parses();
    expect(render(p1.compiler, tpl("p1", 1))).toBe("p1 1 v");
    expect(p1.parses()).toBe(before);
  });

  it("10b. an insert whose eviction empties its own bucket lands in a live bucket", () => {
    const p1 = spyCompiler(108);
    const p2 = spyCompiler(109);
    render(p1.compiler, tpl("p1", 0));
    fill(p2.compiler, "p2", 0, CACHE_MAX - 1);

    // Evicts p1 #0, the bucket's only entry, then inserts p1 #1 into P1.
    render(p1.compiler, tpl("p1", 1));
    expect(_templatePartitionCount()).toBe(2);
    const before = p1.parses();
    expect(render(p1.compiler, tpl("p1", 1))).toBe("p1 1 v");
    expect(p1.parses()).toBe(before);
  });

  it("11. a read miss allocates no bucket", () => {
    render(spyCompiler(110).compiler, tpl("m", 0));
    expect(_templatePartitionCount()).toBe(1);

    expect(isStaticTemplate("unseen", false, 111, 0)).toBeUndefined();
    expect(isStaticTemplate("unseen", true, 110, 0x7fff)).toBeUndefined();

    expect(_templatePartitionCount()).toBe(1);
  });

  it("12. clear empties every partition and a refill behaves like a fresh start", () => {
    const p1 = spyCompiler(112);
    const p2 = spyCompiler(113);
    fill(p1.compiler, "p1", 0, 700);
    fill(p2.compiler, "p2", 0, 800);

    clearTemplateCache();
    expect(_templateCacheSize()).toBe(0);
    expect(_templatePartitionCount()).toBe(0);

    fill(p1.compiler, "q", 0, CACHE_MAX);
    expect(_templateCacheSize()).toBe(CACHE_MAX);
    expect(_templatePartitionCount()).toBe(1);
    const before = p1.parses();
    render(p1.compiler, tpl("q", 0));
    expect(p1.parses()).toBe(before);

    render(p1.compiler, tpl("q", CACHE_MAX));
    render(p1.compiler, tpl("q", 1));
    expect(p1.parses()).toBe(before + 1);
    render(p1.compiler, tpl("q", 0));
    expect(p1.parses()).toBe(before + 2);
  });

  it("13. classifies escaped and plain static text per partition", () => {
    const id = getCompilerId(simpleCompiler);
    const other = inertExtension("other", 16);
    const cases: Array<[string, string, boolean]> = [
      ["Tom''s", "Tom's", false],
      ["Tom & Jerry", "Tom & Jerry", true],
      ["It's here", "It's here", true],
    ];

    for (const [template, rendered, isStatic] of cases) {
      expect(translate(template, "en", undefined, undefined, simpleCompiler)).toBe(rendered);
      expect(isStaticTemplate(template, false, id, 0)).toBe(isStatic);
      // Another partition has not analyzed it yet.
      expect(isStaticTemplate(template, false, id, other.cacheBit)).toBeUndefined();

      translate(template, "en", undefined, { extensions: [other] }, simpleCompiler);
      expect(isStaticTemplate(template, false, id, other.cacheBit)).toBe(isStatic);
      expect(translate(template, "en", undefined, undefined, simpleCompiler)).toBe(rendered);
    }
  });
});

describe("packing boundaries", () => {
  it("14. every (compilerId, extBits, hash) corner resolves to its own entry", () => {
    const ids = [1, 2, 65535, 65536, 65537, 2 ** 37 - 1];
    const allBits = Array.from({ length: 15 }, (_, i) => inertExtension(`bit${i}`, 1 << i));
    expect(effectiveExtBits(allBits)).toBe(0x7fff);
    let parses = 0;
    const compilers = ids.map((cid): MessageCompiler => ({
      cid,
      makeArgToken: (content, hashIsSyntax) => {
        parses++;
        return [TK_TEXT, `${cid}:${hashIsSyntax ? 1 : 0}:${content}`];
      },
    }));
    const contexts = compilers.flatMap((compiler, i) =>
      [undefined, { extensions: allBits }].flatMap((ti) =>
        [false, true].map((hash) => ({ compiler, ti, hash, out: `${ids[i]}:${hash ? 1 : 0}:x` })),
      ),
    );

    for (const { compiler, ti, hash, out } of contexts) {
      expect(render(compiler, "{x}", ti, hash)).toBe(out);
    }
    expect(parses).toBe(contexts.length);
    expect(_templateCacheSize()).toBe(contexts.length);
    expect(_templatePartitionCount()).toBe(contexts.length);

    for (const { compiler, ti, hash, out } of contexts) {
      expect(render(compiler, "{x}", ti, hash)).toBe(out);
    }
    expect(parses).toBe(contexts.length);
  });
});
