import { describe, it, expect, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import type { NextComposedI18n } from "../src/composedHost";
import { createI18n as baseCreateI18n, isVirtualNode } from "@comvi/core";
import type { I18nPlugin, LoaderFn, TagCallbackParams } from "@comvi/core";

/**
 * The PUBLISHED `@comvi/next` root contract: every capability a 0.4 caller
 * could reach through `result.i18n`, exercised through the published factory
 * only. The composed semantics now come from the non-exported
 * `src/composedHost.ts` builder rather than from core's root.
 *
 * The type half is `tests/types/next-contract.test-d.ts`.
 */

const ROUTING = { locales: ["en", "de"], defaultLocale: "en" } as const;

function make(options: Partial<Parameters<typeof createNextI18n>[0]> = {}) {
  return createNextI18n({ ...ROUTING, ...options });
}

// Every `make()` announces itself onto the discovery queue, so the global is
// shared state for the whole file, not just for the two cases that read it.
afterEach(() => {
  delete (window as { __COMVI__?: unknown }).__COMVI__;
});

describe("published createNextI18n — composed capabilities", () => {
  it("compiles ICU plural / select / selectordinal", () => {
    const { i18n } = make({
      translation: {
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
    const { i18n } = make({ translation: { en: { rich: "click <b>here</b> now" } } });

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
      translation: { en: { rich: "read <strong>this</strong>" } },
    });

    const parts = i18n.tRaw("rich");
    expect(Array.isArray(parts)).toBe(true);
    const element = (parts as unknown[]).find((part) => part !== null && typeof part === "object");
    expect(isVirtualNode(element)).toBe(true);
    expect((element as { tag?: string }).tag).toBe("strong");
  });

  it("flattens NESTED constructor catalogs (the ordering-sensitive claim)", () => {
    const { i18n } = make({ translation: { en: { nav: { home: "Home", deep: { x: "X" } } } } });

    expect(i18n.t("nav.home")).toBe("Home");
    expect(i18n.t("nav.deep.x")).toBe("X");
  });

  it("applies defaultParams and lets a call override them", () => {
    const { i18n } = make({
      translation: { en: { p: "{brand} says {msg}" } },
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
    await i18n.setLocaleAsync("de");
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

    i18n.use((host) => {
      log.push("init-a");
      host.registerLoader(async () => ({ pk: "from-plugin" }));
      return () => void log.push("cleanup-a");
    });
    i18n.use(() => {
      log.push("init-b");
      return () => void log.push("cleanup-b");
    });

    await i18n.init();
    expect(log).toEqual(["init-a", "init-b"]);
    expect(i18n.t("pk")).toBe("from-plugin");

    await i18n.destroy();
    expect(log).toEqual(["init-a", "init-b", "cleanup-b", "cleanup-a"]);
  });

  it("announces to the extension and removes its identity on destroy", async () => {
    const win = window as { __COMVI__?: unknown };

    const { i18n } = make();

    const queue = win.__COMVI__ as Array<{ i: unknown }>;
    expect(Array.isArray(queue)).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.i).toBe(i18n);
    // `createNextI18n` never took an `instanceId` option: discovery assigns
    // the auto-generated one, exactly as the 0.4 root constructor did.
    expect(typeof i18n.instanceId).toBe("string");

    await i18n.destroy();

    expect(queue).toHaveLength(0);
  });

  it("keeps instanceId as the FINAL public own property", () => {
    const { i18n } = make({ translation: { en: { a: "A" } } });

    const publicKeys = Object.keys(i18n).filter((key) => !key.startsWith("_"));

    expect(publicKeys[publicKeys.length - 1]).toBe("instanceId");
  });

  it("honours onMissingKey", () => {
    const { i18n } = make({ onMissingKey: () => "from-option" });

    expect(i18n.t("absent")).toBe("from-option");
  });
});

describe("published createNextI18n — the result surface", () => {
  it("registers plugins through every .use* method and stays chainable", async () => {
    const seen: string[] = [];
    const plugin =
      (name: string): I18nPlugin =>
      () => {
        seen.push(name);
      };

    const result = make();
    const chained = result
      .use(plugin("use"))
      .useClient(plugin("useClient"))
      .useServer(plugin("useServer"))
      .useClientLazy(async () => plugin("useClientLazy"))
      .useServerLazy(async () => plugin("useServerLazy"));

    expect(chained).toBe(result);

    await result.i18n.init();

    // The client-scoped plugins run in this DOM-ish environment (happy-dom,
    // NEXT_RUNTIME unset); the server-scoped ones are scoped out. Both paths
    // registered without error, which is the contract this pins.
    expect(seen).toContain("use");
    expect(seen).toContain("useClient");
    expect(seen).toContain("useClientLazy");
    expect(seen).not.toContain("useServer");
    expect(seen).not.toContain("useServerLazy");
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
      "use",
      "setPluginData",
      "getPluginData",
      "registerLocaleDetector",
      "getLanguageDetector",
      "registerPostProcessor",
      "onMissingKey",
      "registerLoader",
      "getLoader",
      "reloadTranslations",
      "addActiveNamespace",
      "addActiveNamespaces",
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
    expect(Object.keys(make()).sort()).toEqual([
      "i18n",
      "routing",
      "use",
      "useClient",
      "useClientLazy",
      "useServer",
      "useServerLazy",
    ]);
  });

  it("compiles ICU where the direct-host base throws E_ICU_SYNTAX", () => {
    const plural = { items: "{count, plural, one {# item} other {# items}}" };

    expect(make({ translation: { en: plural } }).i18n.t("items", { count: 3 })).toBe("3 items");

    // The base host is the loud one: dev throws at the ingestion preflight,
    // production throws on the first uncached format. Wrapping BOTH steps pins
    // the code without pinning the timing.
    const ingestAndFormat = () => {
      const base = baseCreateI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: plural },
      });
      base.t("items" as never, { count: 3 } as never);
    };

    expect(ingestAndFormat, "expected E_ICU_SYNTAX").toThrow(Error);
    expect(ingestAndFormat).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
  });

  it("hosts plugins and flattens nested catalogs where the base host does neither", () => {
    const nested = { nav: { home: "Home" } };

    const composed = make({ translation: { en: nested } }).i18n;
    expect(typeof composed.use).toBe("function");
    expect(composed.t("nav.home")).toBe("Home");

    const base = baseCreateI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: nested },
    }) as unknown as Record<string, unknown>;
    expect(base.use).toBeUndefined();
    expect(base.registerLoader).toBeUndefined();
  });
});
