import { describe, it, expect, vi } from "vitest";
// The COMPOSITE host: since the single-entry convergence `../../src` is the
// BASE host, and the batteries-included 0.4 semantics live on in the internal
// composite `src/core/full.ts` (what the CDN global ships and `@comvi/next`'s
// builder mirrors). Imported directly — never through the tags-registering
// helper — so this file's ambient-extension assertions stay meaningful.
//
// NAMING: the `root` locals and the "ROOT instance/entry" wording in the cases
// below all denote THAT internal composite — the surface core's root entry had
// in 0.4 — never core's converged root, which is the base host `createI18n`
// builds here.
import { I18n } from "../../src/core/full";
import { createI18n } from "../../src";
import { attachLoader, createImportMapLoader, loader } from "../../src/loader";
import { attachPlugins, plugins } from "../../src/plugins";
import { attachDevtools, devtools } from "../../src/devtools";
import { hasLoaderApi, hasPluginHostApi, missingCapability } from "../../src/utils/capability";

/**
 * `@comvi/core` + `@comvi/core/loader` + `@comvi/core/plugins`
 * composition (Phase 7).
 *
 * The capabilities are absent from a bare base instance by module graph;
 * `attachLoader` / `attachPlugins` install the same implementations the
 * internal composite class carries on its prototype chain.
 */
describe("base + /loader composition", () => {
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
    // only existed after `_initLoader` would be too late. The composite gets
    // it via `extends`; a base instance only after attaching, which is why
    // this case is asserted through `attachLoader` + `addTranslations` above
    // and through the composite here.
    const root = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { nav: { home: "Home" } } as never },
    });

    expect(root.t("nav.home")).toBe("Home");
  });
});

describe("the loader capability's argument contract", () => {
  it("rejects a non-function loader with an ACTIONABLE message — never 'use the root'", () => {
    // The base host has no `registerLoader` at all, so an error that told an
    // import-map user to "use the root entry" would send them to a host without
    // the method. The remedies it names must both exist on THIS host.
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    let thrown: unknown;
    try {
      (i18n as unknown as { registerLoader: (value: unknown) => void }).registerLoader({
        en: () => Promise.resolve({ default: {} }),
      });
    } catch (error) {
      thrown = error;
    }

    const message = (thrown as Error).message;
    expect(message).toContain("must be a loader function");
    expect(message).toContain(".with(loader(map))");
    expect(message).toContain("createImportMapLoader");
    expect(message).not.toMatch(/use the root/i);
  });

  it("names the composition remedy in the missing-capability error, not the root", () => {
    const bare = createI18n({ locale: "en", exposeGlobal: false });

    const loaderError = missingCapability("loader").message;
    expect(loaderError).toContain(".with(loader())");
    expect(loaderError).toContain("@comvi/core/loader");
    expect(loaderError).not.toMatch(/use the root/i);

    const pluginsError = missingCapability("plugins").message;
    expect(pluginsError).toContain(".with(plugins())");
    expect(pluginsError).not.toMatch(/use the root/i);

    // And the guard those errors serve still reports the bare host honestly.
    expect(hasLoaderApi(bare)).toBe(false);
    expect(hasPluginHostApi(bare)).toBe(false);
  });
});

describe("base + /plugins composition", () => {
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
  [
    "composed host",
    () => new I18n({ locale: "en", exposeGlobal: false, onMissingKey: () => "option" }),
  ],
  [
    "composed base",
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

/**
 * `.with(installer)` — the composition pipe (fs-dx2).
 *
 * `with` lives on the BASE class and is literally `installer(this)`. These
 * cases pin the two things that makes it safe to put there: it is an ordinary
 * prototype method (A11), and composing a capability the host already has
 * changes NOTHING — the contract a follow-up lane needs before published
 * plugin packages become directly `.with`-able.
 *
 * The published plugin ecosystem is exercised against this API end-to-end in
 * `packages/plugin-fetch-loader/tests/slim-composition.integration.test.ts`,
 * which runs the real `FetchLoader` on core's BUILT `/slim` + `/loader` +
 * `/plugins` surfaces (it cannot live here: @comvi/core must not devDepend on
 * a package that peer-depends on it).
 */
describe(".with(installer) — the composition pipe", () => {
  it.each([
    ["base", () => createI18n({ locale: "en", exposeGlobal: false })],
    ["composed host", () => new I18n({ locale: "en", exposeGlobal: false })],
  ] as const)("is a non-enumerable prototype method (%s)", (_label, make) => {
    const i18n = make();

    // Resolve it the way the language does: root reaches the base class two
    // links up, slim one — either way it must never be an own property.
    let descriptor: PropertyDescriptor | undefined;
    for (
      let proto = Object.getPrototypeOf(i18n) as object | null;
      proto && proto !== Object.prototype && !descriptor;
      proto = Object.getPrototypeOf(proto) as object | null
    ) {
      descriptor = Object.getOwnPropertyDescriptor(proto, "with");
    }

    expect(typeof descriptor?.value).toBe("function");
    expect({
      writable: descriptor!.writable,
      enumerable: descriptor!.enumerable,
      configurable: descriptor!.configurable,
    }).toEqual({ writable: true, enumerable: false, configurable: true });
    expect(Object.prototype.hasOwnProperty.call(i18n, "with")).toBe(false);
    expect(Object.keys(i18n)).not.toContain("with");
  });

  it("is a pipe and nothing more: with(f) is f(this)", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const installer = vi.fn((host: typeof i18n) => ({ host, tag: "installed" }));

    const result = i18n.with(installer);

    expect(installer).toHaveBeenCalledExactlyOnceWith(i18n);
    expect(result.host).toBe(i18n);
    expect(result.tag).toBe("installed");
  });

  it("accepts the low-level attaches directly — they ARE installers", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n.with(attachLoader)).toBe(i18n);
    expect(typeof i18n.getLoader).toBe("function");
    expect(typeof i18n.with(attachPlugins).use).toBe("function");
  });
});

describe(".with(loader(…)) — the configured loader installer", () => {
  it("bare loader() attaches the capability and configures nothing", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(loader());

    expect(typeof i18n.registerLoader).toBe("function");
    expect(typeof i18n.reloadTranslations).toBe("function");
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("loader(importMap) attaches AND registers, loading on demand", async () => {
    const uk = vi.fn(async () => ({ default: { hello: "Привіт" } }));
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(
      loader({ en: async () => ({ hello: "Hello" }), uk }),
    );

    await i18n.init();
    expect(i18n.t("hello")).toBe("Hello");
    // Lazy by construction: the locale that was never active never imported.
    expect(uk).not.toHaveBeenCalled();

    await i18n.setLocaleAsync("uk");
    expect(i18n.t("hello")).toBe("Привіт");
    expect(uk).toHaveBeenCalledOnce();
  });

  it("reads the default namespace live, so setDefaultNamespace after composition applies", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(
      loader({ "en:site": async () => ({ hello: "Hello" }) }),
    );

    i18n.setDefaultNamespace("site");
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("installs exactly the descriptors attachLoader does", () => {
    const piped = createI18n({ locale: "en", exposeGlobal: false }).with(loader());
    const attached = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    expect(Object.getOwnPropertyNames(piped).sort()).toEqual(
      Object.getOwnPropertyNames(attached).sort(),
    );
  });

  it("is a no-op the second time and keeps the registered loader", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(
      loader({ en: async () => ({ hello: "Hello" }) }),
    );
    const registered = i18n.getLoader();
    const ownProps = Object.getOwnPropertyNames(i18n);

    const again = i18n.with(loader());

    expect(again).toBe(i18n);
    expect(again.getLoader()).toBe(registered);
    expect(Object.getOwnPropertyNames(i18n)).toEqual(ownProps);
  });

  it("changes nothing on a ROOT instance, which already has the capability", () => {
    const root = new I18n({ locale: "en", exposeGlobal: false });
    const before = Object.getOwnPropertyNames(root);
    const inheritedRegisterLoader = root.registerLoader;

    const piped = root.with(loader());

    expect(piped).toBe(root);
    // A11: no own property shadows the inherited prototype member.
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(root, "registerLoader")).toBe(false);
    expect(root.registerLoader).toBe(inheritedRegisterLoader);
    expect(root.getLoader()).toBeUndefined();
  });

  it("still CONFIGURES a root instance when handed an import map", async () => {
    const root = new I18n({ locale: "en", exposeGlobal: false }).with(
      loader({ en: async () => ({ default: { hello: "Hello" } }) }),
    );

    expect(Object.prototype.hasOwnProperty.call(root, "registerLoader")).toBe(false);
    await root.init();
    expect(root.t("hello")).toBe("Hello");
  });

  it("produces the same loader an explicit createImportMapLoader would", async () => {
    const map = { en: async () => ({ hello: "Hello" }) };
    const piped = createI18n({ locale: "en", exposeGlobal: false }).with(loader(map));
    const manual = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    manual.registerLoader(createImportMapLoader(map, () => manual.getDefaultNamespace()));

    await Promise.all([piped.init(), manual.init()]);

    expect(piped.getTranslations()).toEqual(manual.getTranslations());
  });
});

describe(".with(plugins()) / .with(devtools()) — the other two installers", () => {
  it("plugins() installs the host and is idempotent", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(plugins());
    i18n.setPluginData("probe", "set");

    expect(i18n.with(plugins())).toBe(i18n);
    expect(i18n.getPluginData("probe")).toBe("set");
  });

  it("plugins() changes nothing on a ROOT instance", () => {
    const root = new I18n({ locale: "en", exposeGlobal: false });
    const before = Object.getOwnPropertyNames(root);

    expect(root.with(plugins())).toBe(root);
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(root, "use")).toBe(false);
  });

  it("devtools(options) configures discovery, and a second pipe keeps the first id", () => {
    // `exposeGlobal: false` opts out of the id too — assigning one is part of
    // exposing, so the configured case has to actually expose.
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(
      devtools({ instanceId: "app", exposeGlobal: true }),
    );

    expect(i18n.instanceId).toBe("app");
    expect(i18n.with(devtools({ instanceId: "other", exposeGlobal: true }))).toBe(i18n);
    expect(i18n.instanceId).toBe("app");
  });

  it("devtools() changes nothing on a ROOT instance", () => {
    const root = new I18n({ locale: "en", exposeGlobal: true, instanceId: "root-app" });
    const before = Object.getOwnPropertyNames(root);

    expect(root.with(devtools({ instanceId: "hijack" }))).toBe(root);
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(root.instanceId).toBe("root-app");
  });

  it("matches the descriptors the bare attaches install", () => {
    const piped = createI18n({ locale: "en", exposeGlobal: false })
      .with(plugins())
      .with(devtools({ exposeGlobal: false }));
    const attached = attachDevtools(
      attachPlugins(createI18n({ locale: "en", exposeGlobal: false })),
      {
        exposeGlobal: false,
      },
    );

    expect(Object.getOwnPropertyNames(piped).sort()).toEqual(
      Object.getOwnPropertyNames(attached).sort(),
    );
  });
});

describe(".with chaining — order is the caller's", () => {
  it.each([
    ["loader then plugins", true],
    ["plugins then loader", false],
  ] as const)("composes both capabilities: %s", async (_label, loaderFirst) => {
    const bare = createI18n({ locale: "en", exposeGlobal: false });
    const i18n = loaderFirst
      ? bare.with(loader()).with(plugins())
      : bare.with(plugins()).with(loader());
    const order: string[] = [];

    i18n.use((host) => {
      order.push("plugin");
      host.registerLoader(async () => ({ hello: "Hello" }));
      return () => void order.push("cleanup");
    });
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
    expect(order).toEqual(["plugin"]);

    await i18n.destroy();
    expect(order).toEqual(["plugin", "cleanup"]);
  });

  it("keeps a loader configured by loader(map) when plugins() lands after it", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false })
      .with(loader({ en: async () => ({ hello: "Hello" }) }))
      .with(plugins());

    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
    expect(typeof i18n.getPluginData).toBe("function");
  });
});
