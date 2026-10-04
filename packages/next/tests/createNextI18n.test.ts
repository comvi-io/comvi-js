import { describe, it, expect, vi } from "vitest";
import type { I18nPlugin, MessageCompiler } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { definePlugin } from "@comvi/core/plugins";
import { createNextI18n } from "../src/createNextI18n";
import { nextPlugin, nextPluginLazy } from "../src/nextPlugin";
import { localizeHref } from "../src/routing/utils";

// `unstubEnvs` in vitest.config.ts restores every stubbed var after each test.
const runInServerRuntime = async (fn: () => Promise<void>) => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  await fn();
};

describe("createNextI18n", () => {
  it("creates i18n and routing with defaults", () => {
    const { i18n, routing } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      devMode: false,
    });

    expect(i18n.locale).toBe("en");
    expect(i18n.getDefaultNamespace()).toBe("default");

    expect(routing.locales).toEqual(["en", "fr"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
    expect(routing.localeCookie).toBe("NEXT_LOCALE");
    expect(routing.pathnames).toEqual({});
  });

  it("returns an i18n instance with a working t() function", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      devMode: false,
    });

    i18n.addMessages({
      "en:default": { greeting: "Hello" },
    });

    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("accepts the static messages option from core", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      messages: {
        en: {
          greeting: "Hello from static",
        },
        fr: {
          greeting: "Bonjour statique",
        },
      },
      devMode: false,
    });

    expect(i18n.t("greeting", { locale: "en" })).toBe("Hello from static");
    expect(i18n.t("greeting", { locale: "fr" })).toBe("Bonjour statique");
  });

  it("forwards defaultParams to the core instance", () => {
    const { i18n } = createNextI18n({
      locales: ["en"],
      defaultLocale: "en",
      defaultParams: { formality: "formal" as const },
      // The default parameter is consumed by an ICU `select`, so this case
      // needs the compiler named — the factory supplies none.
      compiler: icuCompiler,
      messages: {
        en: { review: "{formality, select, formal {Formal} other {Informal}}" },
      },
      devMode: false,
    });

    expect(i18n.defaultParams?.formality).toBe("formal");
    expect(i18n.t("review" as never)).toBe("Formal");
  });

  it("does not register a default loader automatically", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      devMode: false,
    });

    expect(i18n.getLoader()).toBeUndefined();
  });

  it("defaults fallbackLocale to defaultLocale when not specified", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr", "de"],
      defaultLocale: "fr",
      devMode: false,
    });

    i18n.addMessages({
      "fr:default": { hello: "Bonjour" },
    });

    // `de` is registered empty, so lookups must fall back to `fr`.
    i18n.addMessages({
      "de:default": {},
    });

    expect(i18n.t("hello", { locale: "de" })).toBe("Bonjour");
  });

  it("uses explicit fallbackLocale when provided", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr", "de"],
      defaultLocale: "en",
      fallbackLocale: "de",
      devMode: false,
    });

    i18n.addMessages({
      "de:default": { greeting: "Hallo" },
      "fr:default": {},
    });

    expect(i18n.t("greeting", { locale: "fr" })).toBe("Hallo");
  });

  it("localePrefix 'always' adds prefix even for default locale", () => {
    const { routing } = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "always",
      devMode: false,
    });

    expect(localizeHref("/about", "en", routing)).toBe("/en/about");
    expect(localizeHref("/about", "de", routing)).toBe("/de/about");
  });

  it("localePrefix 'never' omits prefix for all locales", () => {
    const { routing } = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "never",
      devMode: false,
    });

    expect(localizeHref("/about", "en", routing)).toBe("/about");
    expect(localizeHref("/about", "de", routing)).toBe("/about");
  });

  it("localePrefix 'as-needed' only prefixes non-default locales", () => {
    const { routing } = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      devMode: false,
    });

    expect(localizeHref("/about", "en", routing)).toBe("/about");
    expect(localizeHref("/about", "de", routing)).toBe("/de/about");
  });

  it("uses custom defaultNs when provided", () => {
    const { i18n } = createNextI18n({
      locales: ["en"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
    });

    expect(i18n.getDefaultNamespace()).toBe("common");
  });

  it("routing contains all specified locales and defaultLocale", () => {
    const { routing } = createNextI18n({
      locales: ["en", "fr", "de", "uk"],
      defaultLocale: "uk",
      devMode: false,
    });

    expect(routing.locales).toEqual(["en", "fr", "de", "uk"]);
    expect(routing.defaultLocale).toBe("uk");
  });

  it("passes pathnames through to the generated routing config", () => {
    const { routing } = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      pathnames: {
        "/about": {
          en: "/about-us",
          de: "/ueber-uns",
        },
      },
      devMode: false,
    });

    expect(routing.pathnames).toEqual({
      "/about": {
        en: "/about-us",
        de: "/ueber-uns",
      },
    });
  });

  it("wires onMissingKey callback into created i18n instance", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      devMode: false,
      onMissingKey: ({ key, locale, namespace }) => {
        return `missing:${locale}:${namespace}:${key}`;
      },
    });

    expect(i18n.t("does.not.exist", { locale: "fr" })).toBe("missing:fr:common:does.not.exist");
  });

  it("uses NODE_ENV to infer devMode when not explicitly provided", () => {
    vi.stubEnv("NODE_ENV", "production");
    const production = createNextI18n({ locales: ["en"], defaultLocale: "en" });

    vi.stubEnv("NODE_ENV", "development");
    const development = createNextI18n({ locales: ["en"], defaultLocale: "en" });

    expect(production.i18n.devMode).toBe(false);
    expect(development.i18n.devMode).toBe(true);
  });

  it("compiles ICU when the caller names the compiler, and only then", () => {
    const { i18n } = createNextI18n({
      locales: ["en"],
      defaultLocale: "en",
      devMode: false,
      compiler: icuCompiler,
      messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });

    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 items");
  });

  it("takes a `compiler` option, so ICU is one setting and not a hardcode", () => {
    // A compiler that compiles NO argument renders every braced segment as
    // literal text — the one output `icuCompiler` can never produce.
    const literal: MessageCompiler = { makeArgToken: () => undefined };
    const template = "{count, plural, one {# item} other {# items}}";
    const { i18n } = createNextI18n({
      locales: ["en"],
      defaultLocale: "en",
      devMode: false,
      compiler: literal,
      messages: { en: { items: template } },
    });

    expect(i18n.t("items" as never, { count: 3 } as never)).toBe(template);
  });
});

describe("createNextI18n — `.use(installer)` is the composition pipe", () => {
  const runInClientRuntime = async (fn: () => Promise<void>) => {
    vi.stubEnv("NEXT_RUNTIME", undefined);
    await fn();
  };

  const create = () =>
    createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      devMode: false,
    });

  it("calls the installer with the host and returns the SAME result, chainable", () => {
    const nextI18n = create();
    const installer = vi.fn((i18n: typeof nextI18n.i18n) => i18n);

    const chained = nextI18n.use(installer).use(definePlugin(() => undefined));

    expect(installer).toHaveBeenCalledTimes(1);
    expect(installer).toHaveBeenCalledWith(nextI18n.i18n);
    expect(chained).toBe(nextI18n);
    expect(chained.i18n).toBe(nextI18n.i18n);
  });

  it("composes core's installers: `loader(map)` registers the import map on the composed host", async () => {
    const nextI18n = create().use(
      loader({
        en: async () => ({ default: { greeting: "Hello" } }),
        de: async () => ({ default: { greeting: "Hallo" } }),
      }),
    );

    await nextI18n.i18n.init();
    await nextI18n.i18n.setLocale("de");

    expect(nextI18n.i18n.t("greeting")).toBe("Hallo");
  });

  it("refuses an installer that returns a different object (E_USE_HOST_IDENTITY) over result.i18n", () => {
    const nextI18n = create();
    const other = { ...nextI18n.i18n };

    expect(() => nextI18n.use(() => other as never)).toThrow(
      expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }),
    );
    expect(() => nextI18n.use(() => other as never)).toThrow(
      "[i18n] .use(installer) must return the host it was given",
    );
    // The message names the Next way out beside core's.
    expect(() => nextI18n.use(() => other as never)).toThrow(/nextPlugin\(f, \{ runtime \}\)/);
  });

  it("refuses a raw ASYNC plugin, swallowing its rejection so the identity error is the only report", async () => {
    const nextI18n = create();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const rejected = vi.fn(async () => {
        throw new Error("plugin boom");
      });

      expect(() => nextI18n.use(rejected as never)).toThrow(
        expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }),
      );
      expect(rejected).toHaveBeenCalledTimes(1);
      // Let the swallowed rejection settle before asserting nothing surfaced.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("refuses an installer that returns nothing", () => {
    const nextI18n = create();

    expect(() => nextI18n.use((() => undefined) as never)).toThrow(
      expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }),
    );
  });

  it("has exactly `i18n`, `routing` and `use` — the four scoped delegates are gone", () => {
    const nextI18n = create() as unknown as Record<string, unknown>;

    expect(Object.keys(nextI18n).sort()).toEqual(["i18n", "routing", "use"]);
    for (const method of ["useClient", "useServer", "useClientLazy", "useServerLazy"]) {
      expect(nextI18n[method], method).toBeUndefined();
    }
  });

  it("nextPlugin with runtime 'server' runs the plugin during server init", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);

      expect(nextI18n.use(nextPlugin(plugin, { runtime: "server" }))).toBe(nextI18n);

      await nextI18n.i18n.init();
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPlugin with runtime 'client' skips the plugin during server init", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      nextI18n.use(nextPlugin(plugin, { runtime: "client" }));

      await nextI18n.i18n.init();
      expect(plugin).not.toHaveBeenCalled();
    });
  });

  it("nextPlugin with runtime 'client' runs the plugin during client init", async () => {
    await runInClientRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      nextI18n.use(nextPlugin(plugin, { runtime: "client" }));

      await nextI18n.i18n.init();
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPlugin with runtime 'server' skips the plugin during client init", async () => {
    await runInClientRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      nextI18n.use(nextPlugin(plugin, { runtime: "server" }));

      await nextI18n.i18n.init();
      expect(plugin).not.toHaveBeenCalled();
    });
  });

  it("nextPlugin without a runtime runs in both runtimes", async () => {
    const plugin = vi.fn(async () => undefined);
    await runInServerRuntime(async () => {
      const nextI18n = create().use(nextPlugin(plugin));
      await nextI18n.i18n.init();
    });
    await runInClientRuntime(async () => {
      const nextI18n = create().use(nextPlugin(plugin));
      await nextI18n.i18n.init();
    });

    expect(plugin).toHaveBeenCalledTimes(2);
  });

  it("nextPluginLazy resolves and executes a matching lazy plugin on the server", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      const loadPlugin = vi.fn(async () => plugin);
      nextI18n.use(nextPluginLazy(loadPlugin, { runtime: "server" }));

      await nextI18n.i18n.init();
      expect(loadPlugin).toHaveBeenCalledTimes(1);
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPluginLazy rejects init when the module is neither a function nor { default }", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const loadPlugin = vi.fn(async () => ({}) as unknown as I18nPlugin);
      // Plugins are `required` by default, so the resolver's throw surfaces
      // out of init() instead of being swallowed.
      nextI18n.use(nextPluginLazy(loadPlugin, { runtime: "server" }));

      await expect(nextI18n.i18n.init()).rejects.toThrow(/Invalid lazy plugin module/);
      expect(loadPlugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPluginLazy never imports a plugin scoped out of the runtime", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const loadPlugin = vi.fn(async () => vi.fn(async () => undefined));
      nextI18n.use(nextPluginLazy(loadPlugin, { runtime: "client" }));

      await nextI18n.i18n.init();
      expect(loadPlugin).not.toHaveBeenCalled();
    });
  });

  it("nextPluginLazy with no scope resolves the lazy plugin in any runtime, `{ default }` included", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      const loadPlugin = vi.fn(async () => ({ default: plugin }));
      nextI18n.use(nextPluginLazy(loadPlugin));

      await nextI18n.i18n.init();
      expect(loadPlugin).toHaveBeenCalledTimes(1);
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPlugin gates on environment combined with runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await runInServerRuntime(async () => {
      const nextI18n = create();
      const devPlugin = vi.fn(async () => undefined);
      const prodPlugin = vi.fn(async () => undefined);

      nextI18n
        .use(nextPlugin(devPlugin, { runtime: "server", environment: "development" }))
        .use(nextPlugin(prodPlugin, { runtime: "server", environment: "production" }));

      await nextI18n.i18n.init();

      expect(devPlugin).not.toHaveBeenCalled();
      expect(prodPlugin).toHaveBeenCalledTimes(1);
    });
  });

  it("nextPlugin gates on environment alone", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await runInServerRuntime(async () => {
      const nextI18n = create();
      const devPlugin = vi.fn(async () => undefined);
      nextI18n.use(nextPlugin(devPlugin, { environment: "development" }));

      await nextI18n.i18n.init();

      expect(devPlugin).not.toHaveBeenCalled();
    });
  });

  it("treats a runtime with no window as the server even when NEXT_RUNTIME is unset", async () => {
    // A plain Node process (scripts, tests, non-Next servers) sets no
    // NEXT_RUNTIME; the absence of `window` is what makes it the server.
    await runInClientRuntime(async () => {
      vi.stubGlobal("window", undefined);
      const nextI18n = create();
      const serverPlugin = vi.fn(async () => undefined);
      const clientPlugin = vi.fn(async () => undefined);
      nextI18n
        .use(nextPlugin(serverPlugin, { runtime: "server" }))
        .use(nextPlugin(clientPlugin, { runtime: "client" }));

      await nextI18n.i18n.init();

      expect(serverPlugin).toHaveBeenCalledTimes(1);
      expect(clientPlugin).not.toHaveBeenCalled();
    });
  });

  it("runs a plugin scoped only by environment in the client runtime", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await runInClientRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      nextI18n.use(nextPlugin(plugin, { environment: "development" }));

      await nextI18n.i18n.init();

      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("runs a development-scoped plugin and skips a production-scoped one in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await runInServerRuntime(async () => {
      const nextI18n = create();
      const devPlugin = vi.fn(async () => undefined);
      const prodPlugin = vi.fn(async () => undefined);
      nextI18n
        .use(nextPlugin(devPlugin, { environment: "development" }))
        .use(nextPlugin(prodPlugin, { environment: "production" }));

      await nextI18n.i18n.init();

      expect(devPlugin).toHaveBeenCalledTimes(1);
      expect(prodPlugin).not.toHaveBeenCalled();
    });
  });

  it("nextPluginLazy fetches the module once even when the host initializes twice", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      const plugin = vi.fn(async () => undefined);
      const loadPlugin = vi.fn(async () => plugin as unknown as I18nPlugin);
      nextI18n.use(nextPluginLazy(loadPlugin));

      await nextI18n.i18n.init();
      await nextI18n.i18n.init();

      // The plugin itself is re-applied on the second init; only the dynamic
      // import behind it is memoized.
      expect(plugin).toHaveBeenCalledTimes(2);
      expect(loadPlugin).toHaveBeenCalledTimes(1);
    });
  });

  it("names both accepted module shapes when a lazy plugin module is invalid", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = create();
      nextI18n.use(
        nextPluginLazy(async () => ({}) as unknown as I18nPlugin, { runtime: "server" }),
      );

      await expect(nextI18n.i18n.init()).rejects.toThrow(
        "[@comvi/next] Invalid lazy plugin module. " +
          "Expected a plugin function or { default: pluginFunction }.",
      );
    });
  });

  it("nextPlugin strips runtime/environment before forwarding plugin options to registerPlugin", () => {
    const nextI18n = create();
    const registerSpy = vi.spyOn(nextI18n.i18n, "registerPlugin");
    const plugin = vi.fn(async () => undefined);
    const onError = () => {};

    nextI18n.use(
      nextPlugin(plugin, { runtime: "server", required: false, timeout: 2500, onError }),
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy.mock.calls[0]![1]).toEqual({ required: false, timeout: 2500, onError });
  });

  it("nextPluginLazy forwards the plugin options the same way", () => {
    const nextI18n = create();
    const registerSpy = vi.spyOn(nextI18n.i18n, "registerPlugin");

    nextI18n.use(
      nextPluginLazy(async () => vi.fn(async () => undefined), {
        runtime: "client",
        environment: "development",
        required: false,
      }),
    );

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy.mock.calls[0]![1]).toEqual({ required: false });
  });

  it("nextPlugin attaches the plugin host on a bare host, like definePlugin", async () => {
    const { createI18n } = await import("@comvi/core");
    const plugin = vi.fn(async () => undefined);

    await runInServerRuntime(async () => {
      const bare = createI18n({ locale: "en", exposeGlobal: false });
      const host = bare.use(nextPlugin(plugin, { runtime: "server" }));

      expect(host).toBe(bare);
      expect(typeof host.registerPlugin).toBe("function");
      await host.init();
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });
});
