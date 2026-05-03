import { describe, it, expect, vi } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { localizeHref } from "../src/routing/utils";

const runInServerRuntime = async (fn: () => Promise<void>) => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = "nodejs";
  try {
    await fn();
  } finally {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  }
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

    i18n.addTranslations({
      "en:default": { greeting: "Hello" },
    });

    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("accepts static translation option from core", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "fr"],
      defaultLocale: "en",
      defaultNs: "common",
      translation: {
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

    // Add translation only in fallback language (fr)
    i18n.addTranslations({
      "fr:default": { hello: "Bonjour" },
    });

    // Switch to de (no translations loaded) - should fall back to fr
    i18n.addTranslations({
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

    i18n.addTranslations({
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

    // Default locale gets a prefix in "always" mode
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

    // No prefix for any locale in "never" mode
    expect(localizeHref("/about", "en", routing)).toBe("/about");
    expect(localizeHref("/about", "de", routing)).toBe("/about");
  });

  it("localePrefix 'as-needed' only prefixes non-default locales", () => {
    const { routing } = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      devMode: false,
    });

    // Default locale has no prefix, non-default does
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
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const production = createNextI18n({
        locales: ["en"],
        defaultLocale: "en",
      });

      process.env.NODE_ENV = "development";
      const development = createNextI18n({
        locales: ["en"],
        defaultLocale: "en",
      });

      expect(production.i18n.devMode).toBe(false);
      expect(development.i18n.devMode).toBe(true);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("exposes chainable use() and forwards plugin options to i18n.use()", () => {
    const nextI18n = createNextI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      devMode: false,
    });

    const useSpy = vi.spyOn(nextI18n.i18n, "use");
    const pluginA = vi.fn(() => undefined) as unknown as Parameters<typeof nextI18n.use>[0];
    const pluginB = vi.fn(() => undefined) as unknown as Parameters<typeof nextI18n.use>[0];
    const pluginOptions: Parameters<typeof nextI18n.use>[1] = {
      required: false,
      timeout: 2500,
    };

    const chained = nextI18n.use(pluginA).use(pluginB, pluginOptions);

    expect(chained).toBe(nextI18n);
    expect(useSpy).toHaveBeenNthCalledWith(1, pluginA, undefined);
    expect(useSpy).toHaveBeenNthCalledWith(2, pluginB, pluginOptions);
  });

  it("useServer runs plugin during server init", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = createNextI18n({
        locales: ["en", "de"],
        defaultLocale: "en",
        devMode: false,
      });

      const plugin = vi.fn(async () => undefined);
      nextI18n.useServer(plugin);

      await nextI18n.i18n.init();
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("useClient skips plugin during server init", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = createNextI18n({
        locales: ["en", "de"],
        defaultLocale: "en",
        devMode: false,
      });

      const plugin = vi.fn(async () => undefined);
      nextI18n.useClient(plugin);

      await nextI18n.i18n.init();
      expect(plugin).not.toHaveBeenCalled();
    });
  });

  it("useServerLazy resolves and executes lazy plugin on server", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = createNextI18n({
        locales: ["en", "de"],
        defaultLocale: "en",
        devMode: false,
      });

      const plugin = vi.fn(async () => undefined);
      const loadPlugin = vi.fn(async () => plugin);
      nextI18n.useServerLazy(loadPlugin);

      await nextI18n.i18n.init();
      expect(loadPlugin).toHaveBeenCalledTimes(1);
      expect(plugin).toHaveBeenCalledTimes(1);
    });
  });

  it("useClientLazy does not resolve lazy plugin on server", async () => {
    await runInServerRuntime(async () => {
      const nextI18n = createNextI18n({
        locales: ["en", "de"],
        defaultLocale: "en",
        devMode: false,
      });

      const loadPlugin = vi.fn(async () => vi.fn(async () => undefined));
      nextI18n.useClientLazy(loadPlugin);

      await nextI18n.i18n.init();
      expect(loadPlugin).not.toHaveBeenCalled();
    });
  });

  it("respects scoped environment options", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const nextI18n = createNextI18n({
        locales: ["en", "de"],
        defaultLocale: "en",
      });

      const devPlugin = vi.fn(async () => undefined);
      const prodPlugin = vi.fn(async () => undefined);

      nextI18n.useServer(devPlugin, { environment: "development" });
      nextI18n.useServer(prodPlugin, { environment: "production" });

      const originalRuntime = process.env.NEXT_RUNTIME;
      process.env.NEXT_RUNTIME = "nodejs";
      try {
        await nextI18n.i18n.init();
      } finally {
        if (originalRuntime === undefined) {
          delete process.env.NEXT_RUNTIME;
        } else {
          process.env.NEXT_RUNTIME = originalRuntime;
        }
      }

      expect(devPlugin).not.toHaveBeenCalled();
      expect(prodPlugin).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
