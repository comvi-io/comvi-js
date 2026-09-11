import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported DIRECTLY rather than
// through the tags-registering helper, so this file's ambient-extension
// assertions stay meaningful.
//
// NAMING: the `root` locals and the "ROOT instance/entry" wording below all
// denote that composite, never `../../src`, which is the base host.
import { I18n } from "../../src/core/full";
import { createI18n } from "../../src";
import { attachLoader, createImportMapLoader, loader } from "../../src/loader";
import { attachPlugins, definePlugin, plugins } from "../../src/plugins";
import { attachDevtools, devtools } from "../../src/devtools";
import { hasLoaderApi, hasPluginHostApi } from "../../src/utils/capability";
import { createDeferred } from "../helpers/deferred";

/**
 * The capabilities are absent from a bare base instance by module graph;
 * `attachLoader` / `attachPlugins` install the same implementations the
 * composite class carries on its prototype chain.
 */
describe("base + /loader composition", () => {
  it("has no loader capability before attaching", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect((i18n as unknown as Record<string, unknown>).registerLoader).toBeUndefined();
    expect((i18n as unknown as Record<string, unknown>).reloadTranslations).toBeUndefined();
  });

  it("installs the capability as non-enumerable own properties", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    // `setLocaleAsync` is the race-machinery OVERRIDE: it shadows the base
    // prototype method and must carry the same class-method descriptor as every
    // other attached member.
    for (const name of ["registerLoader", "getLoader", "reloadTranslations", "setLocaleAsync"]) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      expect(descriptor, name).toBeDefined();
      expect(
        {
          writable: descriptor!.writable,
          enumerable: descriptor!.enumerable,
          configurable: descriptor!.configurable,
        },
        name,
      ).toEqual({ writable: true, enumerable: false, configurable: true });
    }

    // The attach must not change what enumeration sees.
    expect(Object.keys(i18n)).not.toContain("registerLoader");
    expect(Object.keys({ ...i18n })).not.toContain("registerLoader");
  });

  it("is idempotent and preserves already-registered state", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    // Named `loaderFn`, not `loader`: the `loader()` installer is imported above.
    const loaderFn = vi.fn(async () => ({ hello: "Hello" }));
    i18n.registerLoader(loaderFn);

    expect(attachLoader(i18n)).toBe(i18n);
    expect(i18n.getLoader()).toBe(loaderFn);
  });

  it("loads, switches locale and reloads through the attached loader", async () => {
    const store: Record<string, Record<string, string>> = {
      "en:default": { hello: "Hello" },
      "fr:default": { hello: "Bonjour" },
    };
    const loaderFn = vi.fn(async (locale: string, ns: string) => store[`${locale}:${ns}`] ?? {});

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(loaderFn);
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
      "[i18n] No loader registered. Cannot reload translations.",
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
    const pending = createDeferred<Record<string, string>>();

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(async () => pending.promise);

    const load = i18n.addActiveNamespaces(["default"]);
    i18n.clearTranslations();
    pending.resolve({ hello: "Hello" });
    await load;

    // The cancelled load must not repopulate the cache.
    expect(i18n.getTranslations()).toEqual({});
  });

  // The `_flattenNs` seam: a loader returns raw JSON, so nested-catalog
  // flattening belongs to the loader capability, and attaching it must restore
  // the composite's `addTranslations` semantics exactly.
  it("restores nested-catalog flattening on addTranslations", () => {
    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    i18n.addTranslations({ en: { nav: { home: "Home", deep: { x: "X" } }, n: 7 } as never });

    expect(i18n.t("nav.home" as never)).toBe("Home");
    expect(i18n.t("nav.deep.x" as never)).toBe("X");
    expect(i18n.t("n" as never)).toBe("7");
  });

  it("flattens options.translation too — the hook is a prototype member", () => {
    // `options.translation` is merged inside the constructor, so a hook that
    // only existed after `_initLoader` would be too late.
    const root = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { nav: { home: "Home" } } as never },
    });

    expect(root.t("nav.home")).toBe("Home");
  });
});

it("reports both capabilities as absent on a bare host", () => {
  const bare = createI18n({ locale: "en", exposeGlobal: false });

  expect(hasLoaderApi(bare)).toBe(false);
  expect(hasPluginHostApi(bare)).toBe(false);
});

describe("base + /plugins composition", () => {
  const PLUGIN_API = [
    "registerPlugin",
    "registerLocaleDetector",
    "getLanguageDetector",
    "onMissingKey",
    "registerPostProcessor",
    "setPluginData",
    "getPluginData",
  ];

  it("has no plugin host before attaching", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }) as unknown as Record<
      string,
      unknown
    >;

    for (const name of PLUGIN_API) expect(i18n[name], name).toBeUndefined();
  });

  it("installs the capability as non-enumerable own properties", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    for (const name of PLUGIN_API) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      expect(descriptor, name).toBeDefined();
      expect(
        {
          writable: descriptor!.writable,
          enumerable: descriptor!.enumerable,
          configurable: descriptor!.configurable,
        },
        name,
      ).toEqual({ writable: true, enumerable: false, configurable: true });
    }

    expect(Object.keys(i18n)).not.toContain("registerPlugin");
    expect(Object.keys({ ...i18n })).not.toContain("registerPlugin");
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

    i18n.registerPlugin((host) => {
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

    i18n.registerPlugin((host) => {
      host.setPluginData("fetchLoader", { projectId: "p" });
      host.registerLoader(async () => ({ hello: "Hello" }));
    });
    await i18n.init();

    expect(i18n.getPluginData("fetchLoader")).toEqual({ projectId: "p" });
    expect(i18n.t("hello")).toBe("Hello");
  });

  it("chains registered post-processors FIFO", () => {
    const i18n = attachPlugins(
      createI18n({ locale: "en", translation: { en: { hello: "Hello" } }, exposeGlobal: false }),
    );

    i18n.registerPostProcessor((r) => `${r as string}-a`);
    i18n.registerPostProcessor((r) => `${r as string}-b`);

    expect(i18n.t("hello")).toBe("Hello-a-b");
  });

  it("rejects a non-function post-processor", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => i18n.registerPostProcessor(undefined as never)).toThrow(
      "[i18n] registerPostProcessor(): argument must be a function. Received: undefined",
    );
  });

  it("rejects a non-function locale detector", () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    expect(() => i18n.registerLocaleDetector(undefined as never)).toThrow(
      "[i18n] registerLocaleDetector(): argument must be a function.",
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

  it("falls back to the onMissingKey option while every callback returns undefined", () => {
    const i18n = make();

    expect(i18n.t("absent" as never)).toBe("option");

    const dispose = i18n.onMissingKey(() => undefined);
    expect(i18n.t("absent" as never)).toBe("option");

    dispose();
    expect(i18n.t("absent" as never)).toBe("option");
  });
});

// Outside the `.each`: it builds its own host, so a parametrized label would
// name a maker this case never calls.
it("returns the key itself when neither an option nor a callback supplies a value", () => {
  const bare = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

  expect(bare.t("absent" as never)).toBe("absent");
});

/**
 * `.use(installer)` — the ONE composition verb. It lives on the BASE class,
 * calls `installer(this)`, and returns `this` — anything else is refused with
 * `E_USE_NOT_INSTALLER`, which is what separates an installer from a raw
 * plugin. These cases pin the things that make it safe there: it is an
 * ordinary prototype method, composing a capability the host ALREADY has
 * changes nothing, and the identity rule is enforced for sync AND async
 * returns alike.
 *
 * The published plugin ecosystem is exercised against this API end-to-end from
 * `@comvi/plugin-fetch-loader`'s own suite — it cannot live here, because
 * @comvi/core must not devDepend on a package that peer-depends on it.
 */
describe(".use(installer) — the composition pipe", () => {
  it.each([
    ["base", () => createI18n({ locale: "en", exposeGlobal: false })],
    ["composed host", () => new I18n({ locale: "en", exposeGlobal: false })],
  ] as const)("is a non-enumerable prototype method (%s)", (_label, make) => {
    const i18n = make();

    // Resolve it the way the language does: the composite reaches the base
    // class two links up, a base instance one — either way it must never be an
    // own property.
    let descriptor: PropertyDescriptor | undefined;
    for (
      let proto = Object.getPrototypeOf(i18n) as object | null;
      proto && proto !== Object.prototype && !descriptor;
      proto = Object.getPrototypeOf(proto) as object | null
    ) {
      descriptor = Object.getOwnPropertyDescriptor(proto, "use");
    }

    expect(typeof descriptor?.value).toBe("function");
    expect({
      writable: descriptor!.writable,
      enumerable: descriptor!.enumerable,
      configurable: descriptor!.configurable,
    }).toEqual({ writable: true, enumerable: false, configurable: true });
    expect(Object.prototype.hasOwnProperty.call(i18n, "use")).toBe(false);
    expect(Object.keys(i18n)).not.toContain("use");
  });

  it("calls the installer with the host, exactly once, and returns that host", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    // The widening an installer performs is a SIDE EFFECT on the host; the
    // return value is the host itself, retyped.
    const installer = vi.fn((host: typeof i18n) => Object.assign(host, { tag: "installed" }));

    const result = i18n.use(installer);

    expect(installer).toHaveBeenCalledExactlyOnceWith(i18n);
    expect(result).toBe(i18n);
    expect(result.tag).toBe("installed");
  });

  it("accepts the low-level attaches directly — they ARE installers", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    // The attach installs in place and returns the SAME host, so this local is
    // `i18n` — it just carries the widened type the installer returns.
    const withLoader = i18n.use(attachLoader);

    expect(withLoader).toBe(i18n);
    expect(typeof withLoader.getLoader).toBe("function");
    expect(typeof i18n.use(attachPlugins).registerPlugin).toBe("function");
  });

  /**
   * The `E_USE_NOT_INSTALLER` guard. `use` and the plugin queue were two verbs
   * before decision E; now there is one, so the shape a RAW PLUGIN returns —
   * nothing, or a cleanup function — is exactly what tells the two apart. The
   * guard fires on the installer's RETURN, so the plugin body has already run;
   * what it buys is that the caller is told, by name, where its plugin belongs,
   * instead of holding `undefined` typed as the widened host.
   */
  describe("E_USE_NOT_INSTALLER — a raw plugin handed to .use()", () => {
    it.each([
      ["a statement-bodied plugin (undefined)", () => undefined],
      ["a plugin that returns its cleanup", () => () => {}],
      ["a plugin that returns null", () => null],
      ["a plugin that leaked a primitive", () => 42],
      // THE case a shape probe would wave through: an async plugin returns a
      // Promise, which IS an object. Identity catches it, and catches it
      // BEFORE the rejection can go unhandled at composition time.
      ["an ASYNC plugin (a Promise)", async () => {}],
      ["an async plugin that rejects", async () => void (await Promise.reject(new Error("x")))],
      // A derived object is not the host either: installers widen in place.
      ["an installer that builds a new object", (host: unknown) => ({ host })],
    ] as const)("rejects %s", (_label, plugin) => {
      const i18n = createI18n({ locale: "en", exposeGlobal: false });

      expect(() => i18n.use(plugin as unknown as (host: typeof i18n) => typeof i18n)).toThrow(
        expect.objectContaining({ code: "E_USE_NOT_INSTALLER" }),
      );
    });

    it("swallows the rejection an already-invoked async plugin left behind", async () => {
      const i18n = createI18n({ locale: "en", exposeGlobal: false });
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        expect(() =>
          i18n.use((async () => {
            throw new Error("the plugin's own failure");
          }) as unknown as (host: typeof i18n) => typeof i18n),
        ).toThrow(expect.objectContaining({ code: "E_USE_NOT_INSTALLER" }));

        // Two macrotask turns: enough for node to have reported one.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });

    it("names the rule and both ways out in development", () => {
      const i18n = createI18n({ locale: "en", exposeGlobal: false });

      let message = "";
      try {
        i18n.use((() => undefined) as unknown as (host: typeof i18n) => typeof i18n);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("returns the host it was given");
      expect(message).toContain(".use(definePlugin(f))");
      expect(message).toContain("registerPlugin(f)");
      expect(message).toContain("localeDetector(), not LocaleDetector()");
    });

    it("leaves the host untouched — a refused .use() composed nothing", () => {
      const i18n = createI18n({ locale: "en", exposeGlobal: false });
      const before = Object.getOwnPropertyNames(i18n);

      expect(() =>
        i18n.use((() => undefined) as unknown as (host: typeof i18n) => typeof i18n),
      ).toThrow(expect.objectContaining({ code: "E_USE_NOT_INSTALLER" }));

      expect(Object.getOwnPropertyNames(i18n)).toEqual(before);
      expect(hasPluginHostApi(i18n)).toBe(false);
    });

    it("accepts every installer core itself ships — they all return the host", () => {
      // The identity rule is only safe because it is the rule the shipped
      // installers already follow; this is that claim, asserted rather than
      // assumed.
      const i18n = createI18n({ locale: "en", exposeGlobal: false });

      expect(i18n.use(attachLoader)).toBe(i18n);
      expect(i18n.use(attachPlugins)).toBe(i18n);
      expect(i18n.use(attachDevtools)).toBe(i18n);
      expect(i18n.use(loader())).toBe(i18n);
      expect(i18n.use(plugins())).toBe(i18n);
      expect(i18n.use(devtools({ exposeGlobal: false }))).toBe(i18n);
      expect(i18n.use(definePlugin(() => {}))).toBe(i18n);
    });
  });
});

/**
 * `definePlugin(fn, options?)` — how an app registers its OWN inline plugin
 * through the one verb. It is `attachPlugins(host).registerPlugin(fn, options)`
 * wrapped as an installer, so it both ATTACHES the plugin host and queues one
 * plugin on it, and it satisfies the `E_USE_NOT_INSTALLER` guard because it
 * hands the host back.
 */
describe(".use(definePlugin(fn)) — an app's own inline plugin", () => {
  it("attaches the plugin host and returns the same instance", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    const composed = i18n.use(definePlugin(() => {}));

    expect(composed).toBe(i18n);
    expect(hasPluginHostApi(composed)).toBe(true);
    expect(typeof composed.registerPlugin).toBe("function");
  });

  it("runs the plugin at init(), with the host as its argument", async () => {
    const seen: unknown[] = [];
    const i18n = createI18n({ locale: "en", ns: [], exposeGlobal: false }).use(
      definePlugin((host) => {
        seen.push(host);
      }),
    );

    expect(seen).toEqual([]);
    await i18n.init();
    expect(seen).toEqual([i18n]);
  });

  it("forwards the plugin options — a non-required plugin's failure is reported, not fatal", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", ns: [], exposeGlobal: false }).use(
      definePlugin(
        () => {
          throw new Error("boom");
        },
        { required: false, onError },
      ),
    );

    await expect(i18n.init()).resolves.toBe(i18n);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "boom" }));
  });

  it("registers its cleanup, run on destroy", async () => {
    const cleanup = vi.fn();
    const i18n = createI18n({ locale: "en", ns: [], exposeGlobal: false }).use(
      definePlugin(() => cleanup),
    );

    await i18n.init();
    expect(cleanup).not.toHaveBeenCalled();
    await i18n.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("stacks with plugins() and with itself, in any order, keeping every plugin", async () => {
    const order: string[] = [];
    const i18n = createI18n({ locale: "en", ns: [], exposeGlobal: false })
      .use(definePlugin(() => void order.push("a")))
      .use(plugins())
      .use(definePlugin(() => void order.push("b")));

    await i18n.init();
    expect(order).toEqual(["a", "b"]);
  });
});

describe(".use(loader(…)) — the configured loader installer", () => {
  it("bare loader() attaches the capability and configures nothing", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(loader());

    expect(typeof i18n.registerLoader).toBe("function");
    expect(typeof i18n.reloadTranslations).toBe("function");
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("loader(importMap) attaches AND registers, loading on demand", async () => {
    const uk = vi.fn(async () => ({ default: { hello: "Привіт" } }));
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
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
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
      loader({ "en:site": async () => ({ hello: "Hello" }) }),
    );

    i18n.setDefaultNamespace("site");
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("installs exactly the descriptors attachLoader does", () => {
    const piped = createI18n({ locale: "en", exposeGlobal: false }).use(loader());
    const attached = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    expect(Object.getOwnPropertyNames(piped).sort()).toEqual(
      Object.getOwnPropertyNames(attached).sort(),
    );
  });

  it("is a no-op the second time and keeps the registered loader", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
      loader({ en: async () => ({ hello: "Hello" }) }),
    );
    const registered = i18n.getLoader();
    const ownProps = Object.getOwnPropertyNames(i18n);

    const again = i18n.use(loader());

    expect(again).toBe(i18n);
    expect(again.getLoader()).toBe(registered);
    expect(Object.getOwnPropertyNames(i18n)).toEqual(ownProps);
  });

  it("changes nothing on a ROOT instance, which already has the capability", () => {
    const root = new I18n({ locale: "en", exposeGlobal: false });
    const before = Object.getOwnPropertyNames(root);
    const inheritedRegisterLoader = root.registerLoader;

    const piped = root.use(loader());

    expect(piped).toBe(root);
    // No own property shadows the inherited prototype member.
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(root, "registerLoader")).toBe(false);
    expect(root.registerLoader).toBe(inheritedRegisterLoader);
    expect(root.getLoader()).toBeUndefined();
  });

  it("still CONFIGURES a root instance when handed an import map", async () => {
    const root = new I18n({ locale: "en", exposeGlobal: false }).use(
      loader({ en: async () => ({ default: { hello: "Hello" } }) }),
    );

    expect(Object.prototype.hasOwnProperty.call(root, "registerLoader")).toBe(false);
    await root.init();
    expect(root.t("hello")).toBe("Hello");
  });

  it("produces the same loader an explicit createImportMapLoader would", async () => {
    const map = { en: async () => ({ hello: "Hello" }) };
    const piped = createI18n({ locale: "en", exposeGlobal: false }).use(loader(map));
    const manual = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    manual.registerLoader(createImportMapLoader(map, () => manual.getDefaultNamespace()));

    await Promise.all([piped.init(), manual.init()]);

    expect(piped.getTranslations()).toEqual(manual.getTranslations());
  });
});

describe(".use(plugins()) / .use(devtools()) — the other two installers", () => {
  // Two cases below expose on the real `window.__COMVI__`; leave it as found.
  const win = window as { __COMVI__?: unknown };

  beforeEach(() => {
    delete win.__COMVI__;
  });

  afterEach(() => {
    delete win.__COMVI__;
  });

  it("plugins() installs the host and is idempotent", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(plugins());
    i18n.setPluginData("probe", "set");

    expect(i18n.use(plugins())).toBe(i18n);
    expect(i18n.getPluginData("probe")).toBe("set");
  });

  it("plugins() changes nothing on a ROOT instance", () => {
    const root = new I18n({ locale: "en", exposeGlobal: false });
    const before = Object.getOwnPropertyNames(root);

    expect(root.use(plugins())).toBe(root);
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(root, "registerPlugin")).toBe(false);
  });

  it("devtools(options) configures discovery, and a second pipe keeps the first id", () => {
    // `exposeGlobal: false` opts out of the id too — assigning one is part of
    // exposing, so the configured case has to actually expose.
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
      devtools({ instanceId: "app", exposeGlobal: true }),
    );

    expect(i18n.instanceId).toBe("app");
    expect(i18n.use(devtools({ instanceId: "other", exposeGlobal: true }))).toBe(i18n);
    expect(i18n.instanceId).toBe("app");
  });

  it("devtools() changes nothing on a ROOT instance", async () => {
    const root = new I18n({ locale: "en", exposeGlobal: true, instanceId: "root-app" });
    const before = Object.getOwnPropertyNames(root);

    expect(root.use(devtools({ instanceId: "hijack" }))).toBe(root);
    expect(Object.getOwnPropertyNames(root)).toEqual(before);
    expect(root.instanceId).toBe("root-app");

    await root.destroy();
  });

  it("matches the descriptors the bare attaches install", () => {
    const piped = createI18n({ locale: "en", exposeGlobal: false })
      .use(plugins())
      .use(devtools({ exposeGlobal: false }));
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

describe(".use chaining — order is the caller's", () => {
  it.each([
    ["loader then plugins", true],
    ["plugins then loader", false],
  ] as const)("composes both capabilities: %s", async (_label, loaderFirst) => {
    const bare = createI18n({ locale: "en", exposeGlobal: false });
    const i18n = loaderFirst
      ? bare.use(loader()).use(plugins())
      : bare.use(plugins()).use(loader());
    const order: string[] = [];

    i18n.registerPlugin((host) => {
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
      .use(loader({ en: async () => ({ hello: "Hello" }) }))
      .use(plugins());

    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");
    expect(typeof i18n.getPluginData).toBe("function");
  });
});
