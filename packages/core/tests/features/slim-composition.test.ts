import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";
import { createI18n } from "../../src/slim";
import { attachLoader, createImportMapLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";

/**
 * `@comvi/core/slim` + `@comvi/core/loader` + `@comvi/core/plugins`
 * composition (Phase 7).
 *
 * The capabilities are absent from a bare slim instance by module graph;
 * `attachLoader` / `attachPlugins` install the same implementations the root
 * class carries on its prototype chain.
 */
describe("slim + /loader composition", () => {
  it("has no loader capability before attaching", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect((i18n as Record<string, unknown>).registerLoader).toBeUndefined();
    expect((i18n as Record<string, unknown>).reloadTranslations).toBeUndefined();
  });

  it("installs the capability as non-enumerable own properties", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    // `setLocaleAsync` is the P1 race-machinery OVERRIDE: it shadows the base
    // prototype method and must carry the same class-method descriptor as
    // every other attached member (A11 contract, attach surface).
    for (const name of ["registerLoader", "getLoader", "reloadTranslations", "setLocaleAsync"]) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      expect(descriptor, name).toBeDefined();
      expect({
        writable: descriptor!.writable,
        enumerable: descriptor!.enumerable,
        configurable: descriptor!.configurable,
      }).toEqual({ writable: true, enumerable: false, configurable: true });
    }

    // The attach must not change what enumeration sees.
    expect(Object.keys(i18n)).not.toContain("registerLoader");
    expect(Object.keys({ ...i18n })).not.toContain("registerLoader");
  });

  it("is idempotent and preserves already-registered state", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    const loader = vi.fn(async () => ({ hello: "Hello" }));
    i18n.registerLoader(loader);

    expect(attachLoader(i18n)).toBe(i18n);
    expect(i18n.getLoader()).toBe(loader);
  });

  it("loads, switches locale and reloads through the attached loader", async () => {
    const store: Record<string, Record<string, string>> = {
      "en:default": { hello: "Hello" },
      "fr:default": { hello: "Bonjour" },
    };
    const loader = vi.fn(async (locale: string, ns: string) => store[`${locale}:${ns}`] ?? {});

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(loader);
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");

    await i18n.setLocaleAsync("fr");
    expect(i18n.t("hello")).toBe("Bonjour");

    store["fr:default"] = { hello: "Salut" };
    await i18n.reloadTranslations();
    expect(i18n.t("hello")).toBe("Salut");
  });

  it("reports a missing loader on reload", async () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    await expect(i18n.reloadTranslations()).rejects.toThrow(
      /No loader registered|E_NO_LOADER_REGISTERED/,
    );
  });

  it("accepts an import map through createImportMapLoader", async () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(
      createImportMapLoader({ en: async () => ({ default: { hello: "Hello" } }) }, () =>
        i18n.getDefaultNamespace(),
      ),
    );
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("cancels in-flight loads when translations are cleared", async () => {
    let release!: (value: Record<string, string>) => void;
    const pending = new Promise<Record<string, string>>((resolve) => {
      release = resolve;
    });

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(async () => pending);

    const load = i18n.addActiveNamespaces(["default"]);
    i18n.clearTranslations();
    release({ hello: "Hello" });
    await load;

    // The cancelled load must not repopulate the cache.
    expect(i18n.getTranslations()).toEqual({});
  });

  // The `_flattenNs` seam (tier-3, C6): a loader returns raw JSON, so
  // nested-catalog flattening belongs to the loader capability. Attaching it
  // must restore the root entry's `addTranslations` semantics exactly.
  it("restores nested-catalog flattening on addTranslations", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    i18n.addTranslations({ en: { nav: { home: "Home", deep: { x: "X" } }, n: 7 } as never });

    expect(i18n.t("nav.home" as never)).toBe("Home");
    expect(i18n.t("nav.deep.x" as never)).toBe("X");
    expect(i18n.t("n" as never)).toBe("7");
  });

  it("flattens options.translation too — the hook is a prototype member", () => {
    // `options.translation` is merged inside the constructor, so a hook that
    // only existed after `_initLoader` would be too late. Root gets it via
    // `extends`; a slim instance only after attaching, which is why this
    // case is asserted through `attachLoader` + `addTranslations` above and
    // through the ROOT entry here.
    const root = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { nav: { home: "Home" } } as never },
    });

    expect(root.t("nav.home")).toBe("Home");
  });
});

describe("slim + /plugins composition", () => {
  const PLUGIN_API = [
    "use",
    "registerLocaleDetector",
    "getLanguageDetector",
    "onMissingKey",
    "registerPostProcessor",
    "setPluginData",
    "getPluginData",
  ];

  it("has no plugin host before attaching", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }) as Record<string, unknown>;

    for (const name of PLUGIN_API) expect(i18n[name], name).toBeUndefined();
  });

  it("installs the capability as non-enumerable own properties", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    for (const name of PLUGIN_API) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      expect(descriptor, name).toBeDefined();
      expect({
        writable: descriptor!.writable,
        enumerable: descriptor!.enumerable,
        configurable: descriptor!.configurable,
      }).toEqual({ writable: true, enumerable: false, configurable: true });
    }

    expect(Object.keys(i18n)).not.toContain("use");
    expect(Object.keys({ ...i18n })).not.toContain("use");
  });

  it("is idempotent and preserves already-registered state", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.setPluginData("probe", "set");

    expect(attachPlugins(i18n)).toBe(i18n);
    expect(i18n.getPluginData("probe")).toBe("set");
  });

  it("runs plugins at init, then the plugin-registered locale detector", async () => {
    const order: string[] = [];
    const i18n = attachPlugins(
      attachLoader(
        createI18n({
          locale: "en",
          translation: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
          exposeGlobal: false,
        }),
      ),
    );

    i18n.use((host) => {
      order.push("plugin");
      host.registerLocaleDetector(() => {
        order.push("detector");
        return "fr";
      });
      return () => void order.push("cleanup");
    });

    await i18n.init();

    expect(order).toEqual(["plugin", "detector"]);
    expect(i18n.locale).toBe("fr");
    expect(i18n.t("hello")).toBe("Bonjour");

    await i18n.destroy();
    expect(order).toEqual(["plugin", "detector", "cleanup"]);
  });

  it("hosts a loader-registering plugin when attachLoader ran first (R8)", async () => {
    const i18n = attachPlugins(attachLoader(createI18n({ locale: "en", exposeGlobal: false })));

    i18n.use((host) => {
      host.setPluginData("fetchLoader", { projectId: "p" });
      host.registerLoader(async () => ({ hello: "Hello" }));
    });
    await i18n.init();

    expect(i18n.getPluginData("fetchLoader")).toEqual({ projectId: "p" });
    expect(i18n.t("hello")).toBe("Hello");
  });

  it("chains registered post-processors FIFO and rejects non-functions", () => {
    const i18n = attachPlugins(
      createI18n({ locale: "en", translation: { en: { hello: "Hello" } }, exposeGlobal: false }),
    );

    i18n.registerPostProcessor((r) => `${r as string}-a`);
    i18n.registerPostProcessor((r) => `${r as string}-b`);

    expect(i18n.t("hello")).toBe("Hello-a-b");
    expect(() => i18n.registerPostProcessor(undefined as never)).toThrow(
      /must be a function|E_REGISTER_POST_PROCESSOR/,
    );
  });

  it("rejects a non-function locale detector", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => i18n.registerLocaleDetector(undefined as never)).toThrow(
      /must be a function|E_REGISTER_LOCALE_DETECTOR/,
    );
  });
});

/**
 * Missing-key precedence, pinned identically on the root class and on a
 * composed slim instance: per-call `fallback` outranks everything, then the
 * first defined `onMissingKey` callback result, then the constructor's
 * `onMissingKey` option, then the key itself. Callbacks ALWAYS run (plugins
 * track missing keys through side effects) even when they are outranked.
 */
describe.each([
  ["root", () => new I18n({ locale: "en", exposeGlobal: false, onMissingKey: () => "option" })],
  [
    "composed slim",
    () =>
      attachPlugins(
        createI18n({ locale: "en", exposeGlobal: false, onMissingKey: () => "option" }),
      ),
  ],
] as const)("missing-key precedence (%s)", (_label, make) => {
  it("prefers per-call fallback, then the first callback result, then the option", () => {
    const i18n = make();
    const seen: string[] = [];

    i18n.onMissingKey((key) => void seen.push(`first:${key}`));
    i18n.onMissingKey((key) => {
      seen.push(`second:${key}`);
      return "second";
    });
    i18n.onMissingKey((key) => {
      seen.push(`third:${key}`);
      return "third";
    });

    // Per-call fallback wins, but every callback still ran.
    expect(i18n.t("absent" as never, { fallback: "per-call" } as never)).toBe("per-call");
    expect(seen).toEqual(["first:absent", "second:absent", "third:absent"]);

    // Without a per-call fallback the FIRST defined callback result wins.
    expect(i18n.t("absent" as never)).toBe("second");
  });

  it("falls back to the onMissingKey option, then the key", () => {
    const i18n = make();

    expect(i18n.t("absent" as never)).toBe("option");

    const dispose = i18n.onMissingKey(() => undefined);
    expect(i18n.t("absent" as never)).toBe("option");
    dispose();

    const bare = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));
    expect(bare.t("absent" as never)).toBe("absent");
  });
});
