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
      fallbackLanguage: "en",
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
    const templateWithSetup = nuxtKitMocks.addTemplate.mock.calls[0]?.[0];
    expect(templateWithSetup?.getContents()).toContain(
      'import userSetup from "/app/comvi.setup.ts";',
    );
    expect(templateWithSetup?.getContents()).toContain(
      "[@comvi/nuxt] comvi.setup must export a default function.",
    );
    expect(nuxtKitMocks.addImports).toHaveBeenCalledWith([
      { name: "useI18n", from: "/resolved/./runtime/composables/useI18n" },
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
    expect(
      warnSpy.mock.calls.some(([message]) => String(message).includes("No locales configured")),
    ).toBe(true);
    warnSpy.mockRestore();
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

    const templateWithoutSetup = nuxtKitMocks.addTemplate.mock.calls[0]?.[0];
    expect(templateWithoutSetup?.filename).toBe("comvi.setup.mjs");
    expect(templateWithoutSetup?.getContents()).toContain("runComviSetup() {}");
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

    const template = nuxtKitMocks.addTemplate.mock.calls[0]?.[0];
    expect(template?.getContents()).toContain('import userSetup from "/app/comvi.setup.ts";');
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
      fallbackLanguage: ["uk", "en"],
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
      fallbackLanguage: ["uk", "en"],
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

    expect(paths).toContain("/");
    expect(paths).toContain("/about");
    expect(paths).toContain("/de");
    expect(paths).toContain("/de/about");
    expect(paths).not.toContain("/en");
    expect(paths.some((path) => path.includes("/:locale"))).toBe(false);
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
    expect(paths).toContain("/:localeId/profile");
    expect(paths).toContain("/de/:localeId/profile");
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

    expect(paths).toContain("/en");
    expect(paths).toContain("/de");
    expect(paths).toContain("/en/about");
    expect(paths).toContain("/de/about");
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/about");
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

  it("registers an explicit import for every composable file", () => {
    const dir = resolve(__dirname, "../src/runtime/composables");
    const composableFiles = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(composableFiles).toHaveLength(6);
  });
});
