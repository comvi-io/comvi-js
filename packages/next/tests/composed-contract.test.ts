import { describe, it, expect, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { nextPlugin, nextPluginLazy } from "../src/nextPlugin";
import type { NextComposedI18n } from "../src/composedInstance";
import { createI18n as baseCreateI18n, isVirtualNode } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import type { I18nPlugin, LoaderFn, TagCallbackParams } from "@comvi/core";

/**
 * The PUBLISHED `@comvi/next` root contract: every capability a 0.4 caller
 * could reach through `result.i18n`, exercised through the published factory
 * only. The composed semantics now come from the non-exported
 * `src/composedInstance.ts` builder rather than from core's root.
 *
 * The type half is `tests/types/next-contract.test-d.ts`.
 */

const ROUTING = { locales: ["en", "de"], defaultLocale: "en" } as const;

function make(options: Partial<Parameters<typeof createNextI18n>[0]> = {}) {
  return createNextI18n({ ...ROUTING, ...options });
}

// Only the cases that compose `devtools()` announce themselves onto the
// discovery queue; the global is still shared state for the whole file.
afterEach(() => {
  delete (window as { __COMVI__?: unknown }).__COMVI__;
});

describe("published createNextI18n — composed capabilities", () => {
  it("compiles ICU plural / select / selectordinal once the compiler is named", () => {
    const { i18n } = make({
      compiler: icuCompiler,
      messages: {
        en: {
          items: "{count, plural, one {# item} other {# items}}",
          who: "{gender, select, male {he} female {she} other {they}}",
          nth: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
        },
      },
    });

    expect(i18n.t("items", { count: 1 })).toBe("1 item");
    expect(i18n.t("items", { count: 7 })).toBe("7 items");
    expect(i18n.t("who", { gender: "female" })).toBe("she");
    expect(i18n.t("nth", { n: 3 })).toBe("3rd");
  });

  it("parses ambient string-API tag syntax", () => {
    const { i18n } = make({ messages: { en: { rich: "click <b>here</b> now" } } });

    // The handler arrives through the PARAM channel and receives the tag's
    // props object, whose `children` is the inner text. The declared type is
    // the wider `TranslationResult`, since a tag can also wrap virtual nodes.
    expect(i18n.t("rich", { b: ({ children }: TagCallbackParams) => `**${children}**` })).toBe(
      "click **here** now",
    );
  });

  it("renders tags as virtual nodes through tRaw with basicHtmlTags", () => {
    const { i18n } = make({
      basicHtmlTags: ["strong"],
      messages: { en: { rich: "read <strong>this</strong>" } },
    });

    const parts = i18n.tRaw("rich");
    expect(Array.isArray(parts)).toBe(true);
    const element = (parts as unknown[]).find((part) => part !== null && typeof part === "object");
    expect(isVirtualNode(element)).toBe(true);
    expect((element as { tag?: string }).tag).toBe("strong");
  });

  it("flattens NESTED constructor catalogs (the ordering-sensitive claim)", () => {
    const { i18n } = make({ messages: { en: { nav: { home: "Home", deep: { x: "X" } } } } });

    expect(i18n.t("nav.home")).toBe("Home");
    expect(i18n.t("nav.deep.x")).toBe("X");
  });

  it("applies defaultParams and lets a call override them", () => {
    const { i18n } = make({
      messages: { en: { p: "{brand} says {msg}" } },
      defaultParams: { brand: "Comvi" },
    });

    expect(i18n.t("p", { msg: "hi" })).toBe("Comvi says hi");
    expect(i18n.t("p", { brand: "Other", msg: "hi" })).toBe("Other says hi");
  });

  it("keeps BOTH registerLoader overloads: a loader function", async () => {
    const { i18n } = make();
    i18n.registerLoader(async (locale, ns) => ({ hi: `hi-${locale}-${ns}` }));
    await i18n.init();

    expect(i18n.t("hi")).toBe("hi-en-default");
  });

  it("keeps BOTH registerLoader overloads: a static import map, across a locale switch", async () => {
    const { i18n } = make();
    i18n.registerLoader({
      en: () => Promise.resolve({ default: { k: "EN" } }),
      de: () => Promise.resolve({ default: { k: "DE" } }),
    });
    await i18n.init();

    expect(i18n.t("k")).toBe("EN");
    await i18n.setLocale("de");
    expect(i18n.t("k")).toBe("DE");
  });

  it("rejects a null loader instead of taking it for an import map", () => {
    const { i18n } = make();

    expect(() => i18n.registerLoader(null as unknown as LoaderFn)).toThrow(
      /registerLoader\(\): argument must be a loader function/,
    );
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("accepts namespaced import-map keys", async () => {
    const { i18n } = make({ defaultNs: "app" });
    i18n.registerLoader({ "en:app": () => Promise.resolve({ default: { k: "NS" } }) });
    await i18n.init();

    expect(i18n.t("k")).toBe("NS");
  });

  it("hosts plugins with init order and LIFO cleanup on destroy", async () => {
    const log: string[] = [];
    const { i18n } = make();

    i18n.registerPlugin((host) => {
      log.push("init-a");
      host.registerLoader(async () => ({ pk: "from-plugin" }));
      return () => void log.push("cleanup-a");
    });
    i18n.registerPlugin(() => {
      log.push("init-b");
      return () => void log.push("cleanup-b");
    });

    await i18n.init();
    expect(log).toEqual(["init-a", "init-b"]);
    expect(i18n.t("pk")).toBe("from-plugin");

    await i18n.destroy();
    expect(log).toEqual(["init-a", "init-b", "cleanup-b", "cleanup-a"]);
  });

  it("createNextI18n without devtools() → not on window.__COMVI__, no instanceId", () => {
    const win = window as { __COMVI__?: unknown };

    const { i18n } = make({ messages: { en: { a: "A" } } });

    expect(win.__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
    expect(Object.keys(i18n)).not.toContain("instanceId");
  });

  it.each([
    ["@comvi/next", () => import("../src/index")],
    ["@comvi/next/client", () => import("../src/client")],
    ["@comvi/next/server", () => import("../src/server")],
  ])(
    "createNextI18n(…).use(devtools({ instanceId })) from %s → announced, removed on destroy",
    async (_entry, importEntry) => {
      const { devtools } = await importEntry();
      const win = window as { __COMVI__?: unknown };

      const { i18n } = make().use(devtools({ instanceId: "app" }));

      const queue = win.__COMVI__ as Array<{ i: unknown }>;
      expect(Array.isArray(queue)).toBe(true);
      expect(queue).toHaveLength(1);
      expect(queue[0]!.i).toBe(i18n);
      expect(i18n.instanceId).toBe("app");

      await i18n.destroy();

      expect(queue).toHaveLength(0);
    },
  );

  it("createNextI18n(…).use(devtools()) → instanceId is the FINAL public own property", async () => {
    const { devtools } = await import("../src/index");

    const { i18n } = make({ messages: { en: { a: "A" } } }).use(devtools());

    const publicKeys = Object.keys(i18n).filter((key) => !key.startsWith("_"));

    expect(typeof i18n.instanceId).toBe("string");
    expect(publicKeys[publicKeys.length - 1]).toBe("instanceId");
  });

  it("honours onMissingKey", () => {
    const { i18n } = make({ onMissingKey: () => "from-option" });

    expect(i18n.t("absent")).toBe("from-option");
  });
});

describe("published createNextI18n — the result surface", () => {
  it("registers plugins through `.use(nextPlugin(…))` / `.use(nextPluginLazy(…))` and stays chainable", async () => {
    const seen: string[] = [];
    const plugin =
      (name: string): I18nPlugin =>
      () => {
        seen.push(name);
      };

    const result = make();
    const chained = result
      .use(nextPlugin(plugin("both")))
      .use(nextPlugin(plugin("client"), { runtime: "client" }))
      .use(nextPlugin(plugin("server"), { runtime: "server" }))
      .use(nextPluginLazy(async () => plugin("clientLazy"), { runtime: "client" }))
      .use(nextPluginLazy(async () => plugin("serverLazy"), { runtime: "server" }));

    expect(chained).toBe(result);

    await result.i18n.init();

    // The client-scoped plugins run in this DOM-ish environment (happy-dom,
    // NEXT_RUNTIME unset); the server-scoped ones are scoped out. Both paths
    // registered without error, which is the contract this pins.
    expect(seen).toContain("both");
    expect(seen).toContain("client");
    expect(seen).toContain("clientLazy");
    expect(seen).not.toContain("server");
    expect(seen).not.toContain("serverLazy");
  });

  it("exposes the routing config beside the host", () => {
    const { routing } = make();

    expect(routing.locales).toEqual(["en", "de"]);
    expect(routing.defaultLocale).toBe("en");
  });

  it("hands out the plugin-host members a 0.4 caller could reach", () => {
    const { i18n } = make();
    const host: NextComposedI18n = i18n;

    for (const member of [
      "registerPlugin",
      "setPluginData",
      "getPluginData",
      "registerLocaleDetector",
      "getLanguageDetector",
      "registerPostProcessor",
      "onMissingKey",
      "registerLoader",
      "getLoader",
      "reloadMessages",
      "addActiveNamespace",
      "addActiveNamespaces",
      "removeActiveNamespace",
      "removeActiveNamespaces",
      "onLoadError",
    ] as const) {
      expect(typeof (host as unknown as Record<string, unknown>)[member], member).toBe("function");
    }
  });
});

describe("published createNextI18n — unchanged by the P4 direct-host convergence", () => {
  // `@comvi/next/client` and `@comvi/next/server` expose ONE direct-host
  // constructor and it is the BASE host: rebinding those names must not reach
  // the published root, and the root's composition must not leak back onto the
  // base. Every claim below is a DIFFERENTIAL — the same input through both
  // surfaces, asserted to differ.
  it("is a factory over the base constructor, not the base constructor", () => {
    expect(typeof createNextI18n).toBe("function");
    // `baseCreateI18n` is the binding BOTH direct-host entries re-export (that
    // identity is pinned in tests/entry-surfaces.test.tsx); the published root
    // is a factory OVER it and hands back a result, never a host.
    expect(createNextI18n).not.toBe(baseCreateI18n);
    expect(Object.keys(make()).sort()).toEqual(["i18n", "routing", "use"]);
  });

  it("treats an ICU catalog EXACTLY as the direct-host base does, compiler or none", () => {
    const plural = { items: "{count, plural, one {# item} other {# items}}" };

    // The differential that matters after wave 6: the composed root used to
    // default the compiler and the base host never did, so the same catalog
    // rendered two different ways through one package. Both surfaces now
    // behave identically, and the assertion is written as a comparison rather
    // than as two literals so it holds under either build condition — dev
    // throws at the ingestion preflight, production reports and renders
    // literally, and the point is that the two surfaces AGREE either way.
    const outcome = (build: () => string) => {
      try {
        return { rendered: build() };
      } catch (error) {
        return { code: (error as { code?: unknown }).code };
      }
    };

    const composed = outcome(() =>
      make({ messages: { en: plural } }).i18n.t("items", { count: 3 }),
    );
    const base = outcome(() =>
      baseCreateI18n({
        locale: "en",
        exposeGlobal: false,
        messages: { en: plural },
      }).t("items" as never, { count: 3 } as never),
    );

    expect(composed).toEqual(base);
    // …and naming the compiler is what changes the answer, on both surfaces.
    expect(
      make({ compiler: icuCompiler, messages: { en: plural } }).i18n.t("items", { count: 3 }),
    ).toBe("3 items");
    expect(
      baseCreateI18n({
        locale: "en",
        exposeGlobal: false,
        compiler: icuCompiler,
        messages: { en: plural },
      }).t("items" as never, { count: 3 } as never),
    ).toBe("3 items");
  });

  it("hosts plugins and flattens nested catalogs where the base host does neither", () => {
    const nested = { nav: { home: "Home" } };

    const composed = make({ messages: { en: nested } }).i18n;
    expect(typeof composed.registerPlugin).toBe("function");
    expect(composed.t("nav.home")).toBe("Home");

    const base = baseCreateI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: nested },
    }) as unknown as Record<string, unknown>;
    expect(base.registerPlugin).toBeUndefined();
    expect(base.registerLoader).toBeUndefined();
  });
});
