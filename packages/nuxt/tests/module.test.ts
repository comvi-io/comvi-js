import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NuxtPage } from "@nuxt/schema";

const nuxtKitMocks = {
  createResolver: vi.fn(),
  findPath: vi.fn(),
  addPlugin: vi.fn(),
  addTemplate: vi.fn(),
  addImports: vi.fn(),
  addComponent: vi.fn(),
  addServerImportsDir: vi.fn(),
  addRouteMiddleware: vi.fn(),
  extendPages: vi.fn(),
};

let extendPagesHandler: ((pages: NuxtPage[]) => void) | undefined;

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: (...args: unknown[]) => nuxtKitMocks.createResolver(...args),
  findPath: (...args: unknown[]) => nuxtKitMocks.findPath(...args),
  addPlugin: (...args: unknown[]) => nuxtKitMocks.addPlugin(...args),
  addTemplate: (...args: unknown[]) => nuxtKitMocks.addTemplate(...args),
  addImports: (...args: unknown[]) => nuxtKitMocks.addImports(...args),
  addComponent: (...args: unknown[]) => nuxtKitMocks.addComponent(...args),
  addServerImportsDir: (...args: unknown[]) => nuxtKitMocks.addServerImportsDir(...args),
  addRouteMiddleware: (...args: unknown[]) => nuxtKitMocks.addRouteMiddleware(...args),
  extendPages: (handler: (pages: NuxtPage[]) => void) => {
    extendPagesHandler = handler;
    nuxtKitMocks.extendPages(handler);
  },
}));

function createNuxtStub() {
  return {
    options: {
      runtimeConfig: {
        public: {},
        comvi: {},
      },
      appConfig: {},
      srcDir: "/app/src",
      rootDir: "/app",
      build: {
        transpile: [] as string[],
      },
      vite: {
        optimizeDeps: {
          include: [] as string[],
        },
      },
    },
  } as any;
}

async function importModule() {
  vi.resetModules();
  return (await import("../src/module")).default as any;
}

/** Templates are looked up by filename; their registration order is not a contract. */
function template(filename: string) {
  return nuxtKitMocks.addTemplate.mock.calls.find(
    ([candidate]: [{ filename: string }]) => candidate.filename === filename,
  )?.[0] as { filename: string; getContents: () => string } | undefined;
}

const setupTemplateContents = () => template("comvi.setup.mjs")?.getContents();
const hostTemplateContents = () => template("comvi.host.mjs")?.getContents();

describe("nuxt module setup", () => {
  beforeEach(() => {
    extendPagesHandler = undefined;
    nuxtKitMocks.createResolver.mockReset();
    nuxtKitMocks.findPath.mockReset();
    nuxtKitMocks.addPlugin.mockReset();
    nuxtKitMocks.addTemplate.mockReset();
    nuxtKitMocks.addImports.mockReset();
    nuxtKitMocks.addComponent.mockReset();
    nuxtKitMocks.addServerImportsDir.mockReset();
    nuxtKitMocks.addRouteMiddleware.mockReset();
    nuxtKitMocks.extendPages.mockReset();
    nuxtKitMocks.createResolver.mockReturnValue({
      resolve: (id: string) => `/resolved/${id}`,
    });
    nuxtKitMocks.findPath.mockResolvedValue(null);
  });

  it("declares its Nuxt module identity and option defaults", async () => {
    const moduleDefinition = await importModule();

    expect(moduleDefinition.meta).toEqual({
      name: "@comvi/nuxt",
      configKey: "comvi",
      compatibility: { nuxt: "^3.0.0 || ^4.0.0" },
    });
    expect(moduleDefinition.defaults).toEqual({
      locales: [],
      defaultLocale: "en",
      localePrefix: "as-needed",
      defaultNs: "default",
      icu: false,
      detectBrowserLanguage: {
        useCookie: true,
        cookieName: "i18n_locale",
        cookieMaxAge: 31536000,
        redirectOnFirstVisit: true,
      },
    });
  });

  it("configures runtime/app settings and registers runtime integrations", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockResolvedValue("/app/comvi.setup.ts");

    await moduleDefinition.setup(
      {
        locales: ["en", { code: "de", name: "Deutsch" }],
        defaultLocale: "en",
        localePrefix: "as-needed",
        defaultNs: "common",
        fallbackLanguage: "en",
        defaultParams: { formality: "formal" },
        cdnUrl: "https://cdn.example.com",
        apiBaseUrl: "https://api.example.com",
        apiKey: "secret-key",
        setup: "./comvi.setup.ts",
        detectBrowserLanguage: {
          useCookie: true,
          cookieName: "locale_cookie",
          cookieMaxAge: 60,
          redirectOnFirstVisit: false,
        },
        basicHtmlTags: ["strong", "em"],
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi).toMatchObject({
      locales: ["en", "de"],
      localeObjects: {
        en: { code: "en" },
        de: { code: "de", name: "Deutsch" },
      },
      defaultLocale: "en",
      localePrefix: "as-needed",
      cookieName: "locale_cookie",
      cdnUrl: "https://cdn.example.com",
      apiBaseUrl: "https://api.example.com",
      defaultNs: "common",
      fallbackLocale: "en",
      defaultParams: { formality: "formal" },
      basicHtmlTags: ["strong", "em"],
    });
    expect(nuxt.options.runtimeConfig.comvi).toEqual({ apiKey: "secret-key" });
    expect(nuxt.options.appConfig.comvi).toEqual({
      routing: {
        locales: ["en", "de"],
        localeObjects: {
          en: { code: "en" },
          de: { code: "de", name: "Deutsch" },
        },
        defaultLocale: "en",
        localePrefix: "as-needed",
        cookieName: "locale_cookie",
      },
    });

    expect(nuxtKitMocks.addPlugin).toHaveBeenCalledWith({
      src: "/resolved/./runtime/plugin",
      mode: "all",
    });
    expect(nuxtKitMocks.addTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "comvi.setup.mjs",
        getContents: expect.any(Function),
      }),
    );
    expect(nuxtKitMocks.addImports).toHaveBeenCalledWith([
      { name: "useI18n", from: "/resolved/./runtime/composables/useI18n" },
      { name: "useI18nLoader", from: "/resolved/./runtime/composables/capabilities" },
      { name: "useI18nPlugins", from: "/resolved/./runtime/composables/capabilities" },
      { name: "useLocaleHead", from: "/resolved/./runtime/composables/useLocaleHead" },
      { name: "useLocalePath", from: "/resolved/./runtime/composables/useLocalePath" },
      { name: "useLocaleRoute", from: "/resolved/./runtime/composables/useLocaleRoute" },
      { name: "useRouteConfig", from: "/resolved/./runtime/composables/useRouteConfig" },
      { name: "useSwitchLocalePath", from: "/resolved/./runtime/composables/useSwitchLocalePath" },
    ]);
    expect(nuxtKitMocks.addComponent).toHaveBeenNthCalledWith(1, {
      name: "T",
      filePath: "/resolved/./runtime/components/T",
      export: "default",
    });
    expect(nuxtKitMocks.addComponent).toHaveBeenNthCalledWith(2, {
      name: "NuxtLinkLocale",
      filePath: "/resolved/./runtime/components/NuxtLinkLocale",
      export: "default",
    });
    expect(nuxtKitMocks.addServerImportsDir).toHaveBeenCalledWith(
      "/resolved/./runtime/server/utils",
    );
    expect(nuxtKitMocks.addRouteMiddleware).toHaveBeenCalledWith({
      name: "i18n",
      path: "/resolved/./runtime/middleware/i18n.global",
      global: true,
    });
  });

  it("emits the user setup template with a default-export guard", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockResolvedValue("/app/comvi.setup.ts");

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    const contents = setupTemplateContents();

    expect(contents).toContain('import userSetup from "/app/comvi.setup.ts";');
    expect(contents).toContain("[@comvi/nuxt] comvi.setup must export a default function.");
  });

  it("transpiles the runtime and pre-bundles the wrapper packages", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.build.transpile).toContain("/resolved/./runtime");
    expect(nuxt.options.build.transpile).toContain("@comvi/vue");
    expect(nuxt.options.build.transpile).toContain("@comvi/core");
    expect(nuxt.options.vite.optimizeDeps.include).toEqual(
      expect.arrayContaining(["@comvi/vue", "@comvi/core"]),
    );
  });

  it("warns when required locale options are missing", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup(
      {
        locales: [],
        defaultLocale: "en",
      },
      nuxt,
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No locales configured"));
  });

  it("stays quiet when locales are configured", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("looks a user module up in srcDir before falling back to rootDir", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockImplementation(
      async (_specifier: string, options: { cwd: string; type: string }) =>
        options.cwd === "/app" && options.type === "file" ? "/app/comvi.setup.ts" : null,
    );

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxtKitMocks.findPath).toHaveBeenNthCalledWith(1, "./comvi.setup", {
      cwd: "/app/src",
      type: "file",
    });
    expect(setupTemplateContents()).toContain('import userSetup from "/app/comvi.setup.ts";');
  });

  it("generates a no-op setup template when setup option is omitted", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en"],
        defaultLocale: "en",
      },
      nuxt,
    );

    expect(setupTemplateContents()).toContain("runComviSetup() {}");
  });

  it("auto-detects ./comvi.setup when setup option is omitted", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockResolvedValue("/app/comvi.setup.ts");

    await moduleDefinition.setup(
      {
        locales: ["en"],
        defaultLocale: "en",
      },
      nuxt,
    );

    expect(setupTemplateContents()).toContain('import userSetup from "/app/comvi.setup.ts";');
  });

  it("throws when setup option points to missing file", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockResolvedValue(null);

    await expect(
      moduleDefinition.setup(
        {
          locales: ["en"],
          defaultLocale: "en",
          setup: "./missing.setup.ts",
        },
        nuxt,
      ),
    ).rejects.toThrow('Failed to resolve comvi.setup path: "./missing.setup.ts"');
  });

  it("stays quiet about icu when no hostModule is configured", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", icu: true }, nuxt);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits the base construction branch when hostModule is unset", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    const contents = hostTemplateContents();

    expect(contents).toContain('import { createI18n } from "@comvi/vue";');
    expect(contents).toContain('import { createI18n as createCore } from "@comvi/core";');
    expect(contents).not.toContain("createI18nFromCore");
    // Single-entry policy as codegen: no capability subpath, no installer, no compiler.
    expect(contents).not.toContain("@comvi/core/");
    expect(contents).not.toContain(".with(");
    expect(contents).not.toContain("compiler");
  });

  it("emits the ICU compiler into the default branch when icu is true", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", icu: true }, nuxt);

    const contents = hostTemplateContents();

    // `compiler` is a constructor argument, so `.with()` cannot pipe it on afterwards.
    expect(contents).toContain('import { icuCompiler } from "@comvi/core/icu";');
    // Both hosts, or SSR and hydration compile the same catalog with two compilers.
    expect(contents).toContain("createI18n({ ...options, compiler: icuCompiler })");
    expect(contents).toContain("createCore({ ...options, compiler: icuCompiler })");
    expect(contents).toContain('import { createI18n } from "@comvi/vue";');
    expect(contents).not.toContain("createI18nFromCore");
    expect(contents).not.toContain(".with(");
  });

  it("emits no ICU import when icu is left at its default", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    // No `icu` key at all: what an app that never heard of the option gets.
    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    const contents = hostTemplateContents();

    // A codegen branch, so `@comvi/core/icu` never enters the graph — nothing to tree-shake.
    expect(contents).not.toContain("@comvi/core/icu");
    expect(contents).not.toContain("icuCompiler");
    expect(contents).not.toContain("compiler");
    expect(contents).toContain("return createI18n(options);");
    expect(contents).toContain("return createCore(options);");
  });

  it("ignores icu with a warning when hostModule is set", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockImplementation(async (specifier: string) =>
      specifier === "./comvi.host.ts" ? "/app/comvi.host.ts" : null,
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", icu: true, hostModule: "./comvi.host.ts" },
      nuxt,
    );

    // A composed host picks its own compiler, so the option is overruled, not merged.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("`comvi.icu` has no effect when `hostModule` is set"),
    );

    const contents = hostTemplateContents();

    // Ignored means ignored: the hostModule variant, unaltered.
    expect(contents).toContain('import hostFactory from "/app/comvi.host.ts";');
    expect(contents).toContain('import { createI18nFromCore } from "@comvi/vue";');
    expect(contents).not.toContain("@comvi/core/icu");
    expect(contents).not.toContain("icuCompiler");
  });

  it("emits the composed-host branch and never imports @comvi/core itself when hostModule is set", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockImplementation(async (specifier: string) =>
      specifier === "./comvi.host.ts" ? "/app/comvi.host.ts" : null,
    );

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", hostModule: "./comvi.host.ts" },
      nuxt,
    );

    const contents = hostTemplateContents();

    expect(contents).toContain('import { createI18nFromCore } from "@comvi/vue";');
    expect(contents).toContain('import hostFactory from "/app/comvi.host.ts";');
    // The whole point of branching at build time: no root import to tree-shake.
    expect(contents).not.toContain('from "@comvi/core"');
    expect(contents).toContain("comvi hostModule must export a default function");
    expect(contents).toContain("returned no i18n host");
    // A composed host honours the same nuxt.config the default branch does.
    expect(contents).toContain("hostFactory(options)");
    expect(contents).toContain("createHost({ ...options, locale })");
  });

  it("throws when hostModule points to missing file", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxtKitMocks.findPath.mockResolvedValue(null);

    await expect(
      moduleDefinition.setup(
        {
          locales: ["en"],
          defaultLocale: "en",
          hostModule: "./missing.host.ts",
        },
        nuxt,
      ),
    ).rejects.toThrow('Failed to resolve comvi hostModule path: "./missing.host.ts"');
  });

  it("merges private runtime config and keeps existing values when apiKey option is omitted", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.comvi = {
      apiKey: "runtime-key",
      customSecret: "keep-me",
    };

    await moduleDefinition.setup(
      {
        locales: ["en"],
        defaultLocale: "en",
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.comvi).toEqual({
      apiKey: "runtime-key",
      customSecret: "keep-me",
    });
  });

  it("merges existing public runtime config and preserves runtime-only overrides", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = {
      cdnUrl: "https://runtime.example.com",
      apiBaseUrl: "https://runtime-api.example.com",
      defaultNs: "runtime-default",
      fallbackLocale: ["uk", "en"],
      basicHtmlTags: ["strong"],
      detectBrowserLanguage: {
        useCookie: true,
        cookieName: "runtime_locale",
        cookieMaxAge: 30,
        redirectOnFirstVisit: false,
      },
      extraPublicField: "keep-me",
    };

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        cdnUrl: "https://module.example.com",
        apiBaseUrl: "https://module-api.example.com",
        defaultNs: "module-default",
        fallbackLanguage: "en",
        basicHtmlTags: ["em"],
        detectBrowserLanguage: {
          useCookie: true,
          cookieName: "module_locale",
          cookieMaxAge: 60,
          redirectOnFirstVisit: true,
        },
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi).toMatchObject({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      cookieName: "runtime_locale",
      cdnUrl: "https://runtime.example.com",
      apiBaseUrl: "https://runtime-api.example.com",
      defaultNs: "runtime-default",
      fallbackLocale: ["uk", "en"],
      basicHtmlTags: ["strong"],
      detectBrowserLanguage: {
        useCookie: true,
        cookieName: "runtime_locale",
        cookieMaxAge: 30,
        redirectOnFirstVisit: false,
      },
      extraPublicField: "keep-me",
    });
  });

  it("falls back to module detectBrowserLanguage when runtime config leaves it undefined", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = {
      detectBrowserLanguage: undefined,
    };

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        detectBrowserLanguage: {
          useCookie: true,
          cookieName: "module_locale",
          cookieMaxAge: 60,
          redirectOnFirstVisit: false,
        },
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi.detectBrowserLanguage).toMatchObject({
      useCookie: true,
      cookieName: "module_locale",
      cookieMaxAge: 60,
      redirectOnFirstVisit: false,
    });
    expect(nuxt.options.runtimeConfig.public.comvi.cookieName).toBe("module_locale");
  });

  it("keeps browser detection off and uses the default cookie name when it is disabled", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", detectBrowserLanguage: false },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi.detectBrowserLanguage).toBe(false);
    expect(nuxt.options.runtimeConfig.public.comvi.cookieName).toBe("i18n_locale");
  });

  it("carries an explicit localePrefix into the routing app config", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", localePrefix: "always" },
      nuxt,
    );

    expect(nuxt.options.appConfig.comvi.routing.localePrefix).toBe("always");
  });

  it("defaults the routing prefix mode and namespace when the options omit them", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.appConfig.comvi.routing.localePrefix).toBe("as-needed");
    expect(nuxt.options.runtimeConfig.public.comvi.defaultNs).toBe("default");
  });

  it("keeps the app's own vite configuration while pre-bundling the wrappers", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.vite = {
      server: { hmr: false },
      optimizeDeps: { include: ["existing-dep"] },
    };

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.vite.server).toEqual({ hmr: false });
    expect(nuxt.options.vite.optimizeDeps.include).toEqual([
      "existing-dep",
      "@comvi/vue",
      "@comvi/core",
    ]);
  });

  it("creates the vite pre-bundle entry when the app declares no vite config", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.vite = undefined;

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.vite.optimizeDeps.include).toEqual(["@comvi/vue", "@comvi/core"]);
  });

  it("prefixes non-default locales when localePrefix is left unset", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en", "de"], defaultLocale: "en" }, nuxt);

    const pages: NuxtPage[] = [{ name: "index", path: "/" }];
    extendPagesHandler!(pages);

    expect(pages.map((page) => page.path)).toEqual(["/", "/de"]);
  });

  it.each(["/:locale/blog", "/:locale"])(
    "strips the %s param route that no [locale] file backs",
    async (path) => {
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();

      await moduleDefinition.setup({ locales: ["en", "de"], defaultLocale: "en" }, nuxt);

      const pages: NuxtPage[] = [{ name: "blog", path }];
      extendPagesHandler!(pages);

      expect(pages).toEqual([]);
    },
  );

  it("keeps an ordinary page that has a file but carries no locale marker", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en", "de"], defaultLocale: "en" }, nuxt);

    const pages: NuxtPage[] = [
      { name: "about", path: "/about", file: "/app/pages/about.vue" },
      { name: "blog", path: "/blog", file: "/app/pages/[locale]/blog.vue" },
    ];
    extendPagesHandler!(pages);

    expect(pages.map((page) => page.path)).toEqual(["/about", "/de/about"]);
  });

  it("strips a [locale] file route whose path carries no :locale param", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en", "de"], defaultLocale: "en" }, nuxt);

    const pages: NuxtPage[] = [
      { name: "index", path: "/" },
      { name: "blog", path: "/blog", file: "/app/pages/[locale]/blog.vue" },
    ];
    extendPagesHandler!(pages);

    expect(pages.map((page) => page.path)).toEqual(["/", "/de"]);
  });

  it("adds prefixed routes in as-needed mode and removes locale param routes", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "as-needed",
      },
      nuxt,
    );

    const pages: NuxtPage[] = [
      { name: "index", path: "/" },
      { name: "about", path: "/about" },
      { name: "locale-blog", path: "/:locale/blog", file: "/app/pages/[locale]/blog.vue" },
    ];

    extendPagesHandler!(pages);
    const paths = pages.map((page) => page.path);

    expect(paths).toEqual(["/", "/about", "/de", "/de/about"]);
  });

  it("does not remove routes that only start with ':locale' (e.g. :localeId)", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "as-needed",
      },
      nuxt,
    );

    const pages: NuxtPage[] = [{ name: "profile", path: "/:localeId/profile" }];

    extendPagesHandler!(pages);

    const paths = pages.map((page) => page.path);
    expect(paths).toEqual(["/:localeId/profile", "/de/:localeId/profile"]);
  });

  it("keeps relative child paths when cloning localized nested routes", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "as-needed",
      },
      nuxt,
    );

    const pages: NuxtPage[] = [
      {
        name: "dashboard",
        path: "/dashboard",
        children: [
          {
            name: "dashboard-settings",
            path: "settings",
          },
        ],
      },
    ];

    extendPagesHandler!(pages);

    const localizedParent = pages.find((page) => page.name === "dashboard___de");
    expect(localizedParent?.path).toBe("/de/dashboard");
    expect(localizedParent?.children?.[0]?.path).toBe("settings");
    expect(localizedParent?.children?.[0]?.name).toBe("dashboard-settings___de");
  });

  it("keeps only localized routes in always mode", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "always",
      },
      nuxt,
    );

    const pages: NuxtPage[] = [
      { name: "index", path: "/" },
      { name: "about", path: "/about" },
    ];

    extendPagesHandler!(pages);
    const paths = pages.map((page) => page.path);

    expect(paths).toEqual(["/en", "/en/about", "/de", "/de/about"]);
  });

  it("skips route extension in never mode", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localePrefix: "never",
      },
      nuxt,
    );

    expect(nuxtKitMocks.extendPages).not.toHaveBeenCalled();
    expect(extendPagesHandler).toBeUndefined();
  });

  it("registers an explicit import for every composable file", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    // Derived from the directory, not a hand-copied list: a composable added
    // without an `addImports` entry has to fail here.
    const composableModules = readdirSync(resolve(__dirname, "../src/runtime/composables"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `/resolved/./runtime/composables/${file.replace(/\.ts$/, "")}`)
      .sort();
    const registered = nuxtKitMocks.addImports.mock.calls[0]?.[0] as Array<{
      name: string;
      from: string;
    }>;

    // `capabilities` registers two names from one file, so `from` is the seam.
    expect([...new Set(registered.map((entry) => entry.from))].sort()).toEqual(composableModules);
  });
});
