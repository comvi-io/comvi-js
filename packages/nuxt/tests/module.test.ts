import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NuxtPage } from "@nuxt/schema";

type NuxtTemplateStub = { filename: string; write?: boolean; getContents: () => string };
type ResolvedTemplateStub = { filename: string; dst: string };

const nuxtKitMocks = {
  createResolver: vi.fn(),
  findPath: vi.fn(),
  addPlugin: vi.fn(),
  addTemplate: vi.fn<(template: NuxtTemplateStub) => ResolvedTemplateStub>(),
  addImports: vi.fn(),
  addComponent: vi.fn(),
  addServerImports: vi.fn(),
  addServerPlugin: vi.fn(),
  addRouteMiddleware: vi.fn(),
  extendPages: vi.fn(),
};

let extendPagesHandler: ((pages: NuxtPage[]) => void) | undefined;

/**
 * The `comvi.setup` near-miss probe READS srcDir and rootDir, so every case
 * that expects no warning needs those reads to fail. A unique path under
 * os.tmpdir() is absent by construction — unlike "/app", which a container
 * could genuinely have — and the one case that wants the warning points srcDir
 * at a real tree instead.
 */
const ABSENT_ROOT_DIR = join(tmpdir(), `comvi-nuxt-module-absent-${process.pid}`);
const ABSENT_SRC_DIR = join(ABSENT_ROOT_DIR, "src");

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: (...args: unknown[]) => nuxtKitMocks.createResolver(...args),
  findPath: (...args: unknown[]) => nuxtKitMocks.findPath(...args),
  addPlugin: (...args: unknown[]) => nuxtKitMocks.addPlugin(...args),
  addTemplate: (template: NuxtTemplateStub) => nuxtKitMocks.addTemplate(template),
  addImports: (...args: unknown[]) => nuxtKitMocks.addImports(...args),
  addComponent: (...args: unknown[]) => nuxtKitMocks.addComponent(...args),
  addServerImports: (...args: unknown[]) => nuxtKitMocks.addServerImports(...args),
  addServerPlugin: (...args: unknown[]) => nuxtKitMocks.addServerPlugin(...args),
  addRouteMiddleware: (...args: unknown[]) => nuxtKitMocks.addRouteMiddleware(...args),
  extendPages: (handler: (pages: NuxtPage[]) => void) => {
    extendPagesHandler = handler;
    nuxtKitMocks.extendPages(handler);
  },
}));

function createNuxtStub() {
  return {
    // The module registers the generated `types/comvi-i18n.ts` as a tsconfig
    // reference through `prepare:types`; the payload handler is invoked by the
    // cases that assert on it.
    hook: vi.fn(),
    options: {
      runtimeConfig: {
        public: {},
        comvi: {},
      },
      appConfig: {},
      srcDir: ABSENT_SRC_DIR,
      rootDir: ABSENT_ROOT_DIR,
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

/** The module definition; its `setup` gets the one required option unless a test sets it. */
async function importModule() {
  vi.resetModules();
  const definition = (await import("../src/module")).default as any;
  return {
    ...definition,
    setup: (options: Record<string, unknown>, nuxt: unknown) =>
      definition.setup({ timeZone: "UTC", ...options }, nuxt),
  };
}

/** Templates are looked up by filename; their registration order is not a contract. */
function template(filename: string) {
  return nuxtKitMocks.addTemplate.mock.calls.find(
    ([candidate]) => candidate.filename === filename,
  )?.[0];
}

const optionsTemplateContents = () => template("comvi.options.mjs")?.getContents();

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("nuxt module setup", () => {
  beforeEach(() => {
    extendPagesHandler = undefined;
    nuxtKitMocks.createResolver.mockReset();
    nuxtKitMocks.findPath.mockReset();
    nuxtKitMocks.addPlugin.mockReset();
    nuxtKitMocks.addTemplate.mockReset();
    nuxtKitMocks.addImports.mockReset();
    nuxtKitMocks.addComponent.mockReset();
    nuxtKitMocks.addServerImports.mockReset();
    nuxtKitMocks.addServerPlugin.mockReset();
    nuxtKitMocks.addRouteMiddleware.mockReset();
    nuxtKitMocks.extendPages.mockReset();
    nuxtKitMocks.createResolver.mockReturnValue({
      resolve: (id: string) => `/resolved/${id}`,
    });
    nuxtKitMocks.findPath.mockResolvedValue(null);
    // `addTemplate` RESOLVES a template, and the module reads `.dst` off the
    // type-check template to register it as a tsconfig reference.
    nuxtKitMocks.addTemplate.mockImplementation((candidate) => ({
      filename: candidate.filename,
      dst: `/build/${candidate.filename}`,
    }));
  });

  // The server utilities run in the Nitro build, where `#build/*` is refused:
  // an app whose `server/api` route called `useTranslation(event)` failed
  // `nuxt build`. `test-apps/nuxt4/server/api/translate.get.ts` is that route.

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

  it("merges existing public runtime config and preserves runtime-only overrides", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = {
      head: false,
      localeCookie: { name: "runtime_locale", maxAge: 30 },
      extraPublicField: "keep-me",
    };

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localeCookie: { name: "module_locale", maxAge: 60 },
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi).toEqual({
      locales: ["en", "de"],
      localeObjects: { en: { code: "en" }, de: { code: "de" } },
      defaultLocale: "en",
      localePrefix: "as-needed",
      head: false,
      localeCookie: { name: "runtime_locale", maxAge: 30, secure: true, sameSite: "lax" },
      localeDetection: { order: ["query", "cookie", "accept-language"] },
      extraPublicField: "keep-me",
    });
  });

  it("falls back to the module's localeCookie when runtime config leaves it undefined", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = {
      localeCookie: undefined,
    };

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        localeCookie: { name: "module_locale", maxAge: 60 },
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi.localeCookie).toMatchObject({
      name: "module_locale",
      maxAge: 60,
    });
  });

  it("drops an undefined value an existing public runtime config carries", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = { head: undefined };

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", head: undefined }, nuxt);

    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("head");
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

  /**
   * Route generation for aliases and redirects, through the real `extendPages`
   * hook. A clone that keeps its source's unprefixed alias re-opens the
   * unlocalized URL (under `localePrefix: "always"` that URL is supposed to be
   * gone), and an unprefixed redirect drops the visitor out of their locale.
   */
  describe("localeCookie and localeDetection, the shared vocabulary", () => {
    const setupWith = async (options: Record<string, unknown>, dev = false) => {
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();
      nuxt.options.dev = dev;
      await moduleDefinition.setup(
        { locales: ["en", "de"], defaultLocale: "en", ...options },
        nuxt,
      );
      return nuxt.options.runtimeConfig.public.comvi;
    };

    it("resolves every localeCookie attribute into runtime config", async () => {
      const comvi = await setupWith({
        localeCookie: {
          name: "LANG",
          maxAge: 600,
          secure: false,
          sameSite: "strict",
          domain: ".example.com",
        },
      });

      expect(comvi.localeCookie).toEqual({
        name: "LANG",
        maxAge: 600,
        secure: false,
        sameSite: "strict",
        domain: ".example.com",
      });
    });

    it("reads a localeCookie string as the cookie name", async () => {
      const comvi = await setupWith({ localeCookie: "LANG" });

      expect(comvi.localeCookie).toEqual({
        name: "LANG",
        maxAge: 31536000,
        secure: true,
        sameSite: "lax",
      });
    });

    it("turns persistence off with localeCookie: false and keeps detection on", async () => {
      const comvi = await setupWith({ localeCookie: false });

      expect(comvi.localeCookie).toBe(false);
      expect(comvi.localeDetection).toEqual({ order: ["query", "cookie", "accept-language"] });
    });

    it("carries order, queryParam and headerName, and nothing unset", async () => {
      const comvi = await setupWith({
        localeDetection: {
          order: ["header", "cookie"],
          queryParam: "lang",
          headerName: "x-locale",
        },
      });

      expect(comvi.localeDetection).toEqual({
        order: ["header", "cookie"],
        queryParam: "lang",
        headerName: "x-locale",
      });
    });

    it("turns detection off with localeDetection: false and keeps the cookie", async () => {
      const comvi = await setupWith({ localeDetection: false });

      expect(comvi.localeDetection).toBe(false);
      expect(comvi.localeCookie).toMatchObject({ name: "i18n_locale" });
    });

    it("copies resolveAcceptLanguage into #build/comvi.detection as source", async () => {
      await setupWith({
        localeDetection: {
          resolveAcceptLanguage: (header: string, locales: readonly string[]) =>
            locales.find((locale) => header.startsWith(locale)),
        },
      });

      const contents = template("comvi.detection.mjs")?.getContents() ?? "";
      const run = new Function(
        `${contents.replace("export const", "const")}; return resolveAcceptLanguage;`,
      )() as (header: string, locales: string[]) => string | undefined;
      expect(run("de-AT", ["en", "de"])).toBe("de");
    });

    it("copies a method-shorthand resolveAcceptLanguage too", async () => {
      await setupWith({
        localeDetection: {
          resolveAcceptLanguage(header: string) {
            return header === "x" ? "de" : undefined;
          },
        },
      });

      const contents = template("comvi.detection.mjs")?.getContents() ?? "";
      const run = new Function(
        `${contents.replace("export const", "const")}; return resolveAcceptLanguage;`,
      )() as (header: string) => string | undefined;
      expect(run("x")).toBe("de");
    });

    it("exports no resolver when the app set none", async () => {
      await setupWith({});

      expect(template("comvi.detection.mjs")?.getContents()).toBe(
        "export const resolveAcceptLanguage = undefined;\n",
      );
    });

    it("refuses a resolver it cannot copy, by name", async () => {
      const resolver = ((header: string) => header).bind(null);

      await setupWith({ localeDetection: { resolveAcceptLanguage: resolver } });

      expect(() => template("comvi.detection.mjs")?.getContents()).toThrow(
        "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` could not be copied into the build.",
      );
    });

    it("refuses a resolver whose source is not valid JavaScript", async () => {
      const resolver = (header: string) => header;
      const toString = vi
        .spyOn(Function.prototype, "toString")
        .mockImplementation(() => "(header => ) garbage {");

      try {
        await setupWith({ localeDetection: { resolveAcceptLanguage: resolver } });
        expect(() => template("comvi.detection.mjs")?.getContents()).toThrow(
          "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` could not be copied into the build.",
        );
      } finally {
        toString.mockRestore();
      }
    });
  });

  describe("0.5 has no aliases: a removed key fails setup, naming its replacement", () => {
    const setupFails = async (
      options: Record<string, unknown>,
      runtime?: Record<string, unknown>,
    ) => {
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();
      if (runtime) nuxt.options.runtimeConfig.public.comvi = runtime;
      return moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", ...options }, nuxt);
    };

    it.each([
      [
        { detectBrowserLanguage: { cookieName: "x" } },
        undefined,
        "[@comvi/nuxt] `comvi.detectBrowserLanguage` is not an option: use `localeCookie` and `localeDetection`.",
      ],
      [
        { detectBrowserLanguage: false },
        undefined,
        "[@comvi/nuxt] `comvi.detectBrowserLanguage` is not an option: use `localeCookie` and `localeDetection`.",
      ],
      [
        { fallbackLanguage: "en" },
        undefined,
        "[@comvi/nuxt] `comvi.fallbackLanguage` is not an option: use `fallbackLocale`.",
      ],
      [
        {},
        { cookieName: "x" },
        "[@comvi/nuxt] `runtimeConfig.public.comvi.cookieName` is not an option: use `localeCookie`.",
      ],
      [
        {},
        { detectBrowserLanguage: {} },
        "[@comvi/nuxt] `runtimeConfig.public.comvi.detectBrowserLanguage` is not an option: use `localeCookie` and `localeDetection`.",
      ],
      [
        { localeDetection: { cookieName: "x" } },
        undefined,
        "[@comvi/nuxt] `comvi.localeDetection.cookieName` is not an option: use `comvi.localeCookie.name`.",
      ],
      [
        { localeCookie: { cookieMaxAge: 60 } },
        undefined,
        "[@comvi/nuxt] `comvi.localeCookie.cookieMaxAge` is not an option: use `comvi.localeCookie.maxAge`.",
      ],
      [
        {},
        { localeDetection: { cookieName: "x" } },
        "[@comvi/nuxt] `runtimeConfig.public.comvi.localeDetection.cookieName` is not an option: use `runtimeConfig.public.comvi.localeCookie.name`.",
      ],
      [
        { localeCookie: "LANG" },
        { localeCookie: { cookieSecure: true } },
        "[@comvi/nuxt] `runtimeConfig.public.comvi.localeCookie.cookieSecure` is not an option: use `runtimeConfig.public.comvi.localeCookie.secure`.",
      ],
      [
        { localeDetection: { redirectOnFirstVisit: false } },
        undefined,
        "[@comvi/nuxt] `comvi.localeDetection.redirectOnFirstVisit` is not an option.",
      ],
    ])("%j %j", async (options, runtime, message) => {
      await expect(setupFails(options, runtime)).rejects.toThrow(message);
    });
  });

  it("writes exactly what the shared normalizeRoutingOptions decides for the same input", async () => {
    const { normalizeRoutingOptions } = await import("../src/runtime/_vendor/locale-routing");
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const input = {
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "always" as const,
      localeCookie: { maxAge: 60 },
      localeDetection: { queryParam: "lang" },
    };

    await moduleDefinition.setup(input, nuxt);

    const { locales, defaultLocale, localePrefix, localeCookie, localeDetection } =
      nuxt.options.runtimeConfig.public.comvi;
    expect({ locales, defaultLocale, localePrefix, localeCookie, localeDetection }).toEqual(
      normalizeRoutingOptions(input, { cookieNameDefault: "i18n_locale" }),
    );
  });

  describe("cloned aliases and redirects", () => {
    const localizedPages = async (
      pages: NuxtPage[],
      localePrefix: "always" | "as-needed" = "as-needed",
    ) => {
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();
      await moduleDefinition.setup(
        { locales: ["en", "de"], defaultLocale: "en", localePrefix },
        nuxt,
      );
      extendPagesHandler!(pages);
      return pages;
    };

    const byName = (pages: NuxtPage[], name: string) => pages.find((page) => page.name === name);

    it("localizes an array of internal absolute aliases", async () => {
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", alias: ["/old", "/archive"] },
      ]);

      expect(byName(pages, "legacy___de")?.alias).toEqual(["/de/old", "/de/archive"]);
      // The source page keeps its own, unprefixed aliases.
      expect(byName(pages, "legacy")?.alias).toEqual(["/old", "/archive"]);
    });

    it("localizes a single string alias and the root alias", async () => {
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", alias: "/old" },
        { name: "home", path: "/home", alias: "/" },
      ]);

      expect(byName(pages, "legacy___de")?.alias).toBe("/de/old");
      expect(byName(pages, "home___de")?.alias).toBe("/de");
    });

    it("does not double-prefix an alias that already carries a locale prefix", async () => {
      // A hand-written `alias: "/de/already"` would otherwise clone to
      // `/en/de/already`. next strips an existing prefix before adding one.
      const pages = await localizedPages(
        [{ name: "legacy", path: "/legacy", alias: ["/de/already", "/en", "/enter"] }],
        "always",
      );

      expect(byName(pages, "legacy___en")?.alias).toEqual(["/en/already", "/en", "/en/enter"]);
      expect(byName(pages, "legacy___de")?.alias).toEqual(["/de/already", "/de", "/de/enter"]);
    });

    it("leaves an external or protocol-relative alias alone", async () => {
      const pages = await localizedPages([
        {
          name: "legacy",
          path: "/legacy",
          alias: ["https://example.com/old", "//cdn.example.com/old", "/old"],
        },
      ]);

      expect(byName(pages, "legacy___de")?.alias).toEqual([
        "https://example.com/old",
        "//cdn.example.com/old",
        "/de/old",
      ]);
    });

    it("keeps a child alias relative, like the child path", async () => {
      const pages = await localizedPages([
        {
          name: "dashboard",
          path: "/dashboard",
          children: [{ name: "dashboard-settings", path: "settings", alias: "preferences" }],
        },
      ]);

      expect(byName(pages, "dashboard___de")?.children?.[0]?.alias).toBe("preferences");
    });

    it("localizes a string redirect", async () => {
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", redirect: "/new" },
        { name: "root", path: "/root", redirect: "/" },
      ]);

      expect(byName(pages, "legacy___de")?.redirect).toBe("/de/new");
      expect(byName(pages, "root___de")?.redirect).toBe("/de");
    });

    it("does not double-prefix a redirect that already carries a locale prefix", async () => {
      // Same defect class as the alias case, and the same answer: the target is
      // re-prefixed for this locale. Leaving `/en/de/new` behind is what no
      // author can have meant.
      const pages = await localizedPages(
        [
          { name: "legacy", path: "/legacy", redirect: "/de/new" },
          { name: "object", path: "/object", redirect: { path: "/de/new", query: { a: "1" } } },
        ],
        "always",
      );

      expect(byName(pages, "legacy___en")?.redirect).toBe("/en/new");
      expect(byName(pages, "object___en")?.redirect).toEqual({
        path: "/en/new",
        query: { a: "1" },
      });
    });

    it("leaves an external string redirect alone", async () => {
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", redirect: "https://example.com/new" },
      ]);

      expect(byName(pages, "legacy___de")?.redirect).toBe("https://example.com/new");
    });

    it("localizes the path of a route-location redirect and keeps its query and hash", async () => {
      const pages = await localizedPages([
        {
          name: "legacy",
          path: "/legacy",
          redirect: { path: "/new", query: { from: "legacy" }, hash: "#top" },
        },
      ]);

      expect(byName(pages, "legacy___de")?.redirect).toEqual({
        path: "/de/new",
        query: { from: "legacy" },
        hash: "#top",
      });
    });

    it("retargets a name-based redirect at the cloned route of the same locale", async () => {
      // A name-based redirect is the one form that MUST be rewritten: under
      // `localePrefix: "always"` the unprefixed record it names is removed, so
      // leaving the plain name behind would resolve to nothing. The clone's own
      // names carry the `___<locale>` suffix, so the redirect follows them —
      // including a child name.
      const pages = await localizedPages(
        [
          { name: "legacy", path: "/legacy", redirect: { name: "target" } },
          { name: "legacy-child", path: "/legacy-child", redirect: { name: "dashboard-settings" } },
          { name: "target", path: "/target" },
          {
            name: "dashboard",
            path: "/dashboard",
            children: [{ name: "dashboard-settings", path: "settings" }],
          },
        ],
        "always",
      );

      expect(byName(pages, "legacy___de")?.redirect).toEqual({ name: "target___de" });
      expect(byName(pages, "legacy-child___de")?.redirect).toEqual({
        name: "dashboard-settings___de",
      });
    });

    it("leaves a name-based redirect alone when no cloned page defines that name", async () => {
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", redirect: { name: "somewhere-else" } },
      ]);

      expect(byName(pages, "legacy___de")?.redirect).toEqual({ name: "somewhere-else" });
    });

    it("leaves a name-based redirect at a [locale] page untouched, though that page is deleted", async () => {
      // Documented, not fixed: `[locale]`-param pages are excluded from
      // localization and then removed from the route table entirely, so a
      // redirect naming one cannot resolve — under `always` there is no
      // unprefixed record left to fall back to either. The deletion predates
      // this lot and the name is deliberately left as the author wrote it.
      const pages = await localizedPages(
        [
          { name: "legacy", path: "/legacy", redirect: { name: "locale-blog" } },
          { name: "locale-blog", path: "/:locale/blog", file: "/app/pages/[locale]/blog.vue" },
        ],
        "always",
      );

      expect(byName(pages, "legacy___en")?.redirect).toEqual({ name: "locale-blog" });
      expect(pages.some((page) => page.name === "locale-blog")).toBe(false);
    });

    it("leaves a function redirect alone", async () => {
      // Nuxt types `redirect` as a route location, but vue-router accepts a
      // function at runtime and a user config can carry one; it decides the
      // target itself, so the module must not touch it.
      const redirect = () => "/new";
      const pages = await localizedPages([
        { name: "legacy", path: "/legacy", redirect: redirect as unknown as NuxtPage["redirect"] },
      ]);

      expect(byName(pages, "legacy___de")?.redirect).toBe(redirect);
    });

    it("leaves no unprefixed alias behind under localePrefix always", async () => {
      const pages = await localizedPages(
        [
          { name: "legacy", path: "/legacy", alias: ["/old", "/archive"] },
          { name: "home", path: "/", alias: "/start" },
        ],
        "always",
      );

      const aliases = pages.flatMap((page) =>
        page.alias === undefined ? [] : [page.alias].flat(),
      );

      expect(aliases.length).toBe(6);
      expect(aliases.filter((alias) => /^\/(en|de)(\/|$)/.test(alias))).toEqual(aliases);
    });
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

  describe("0.8: one settings set, the instance is the module's", () => {
    it("declares its identity and defaults", async () => {
      const { meta, defaults } = await importModule();

      expect(meta.name).toBe("@comvi/nuxt");
      expect(meta.configKey).toBe("comvi");
      expect(defaults).toEqual({
        locales: [],
        defaultLocale: "en",
        localePrefix: "as-needed",
        head: true,
      });
    });

    it("registers the plugin, @comvi/vue's composables, the routing composables, <T>, the Nitro utility and its request-end plugin", async () => {
      const moduleDefinition = await importModule();
      await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, createNuxtStub());

      expect(nuxtKitMocks.addPlugin).toHaveBeenCalledWith({
        src: "/resolved/./runtime/plugin",
        mode: "all",
      });
      expect(nuxtKitMocks.addImports.mock.calls.flat(2)).toEqual([
        { name: "useI18n", from: "/resolved/./runtime/composables/useI18n" },
        { name: "useFormat", from: "/resolved/./runtime/composables/useI18n" },
        { name: "useLocaleHead", from: "/resolved/./runtime/composables/useLocaleHead" },
        { name: "useLocalePath", from: "/resolved/./runtime/composables/useLocalePath" },
        { name: "useLocaleRoute", from: "/resolved/./runtime/composables/useLocaleRoute" },
        { name: "useRouteConfig", from: "/resolved/./runtime/composables/useRouteConfig" },
        {
          name: "useSwitchLocalePath",
          from: "/resolved/./runtime/composables/useSwitchLocalePath",
        },
      ]);
      expect(nuxtKitMocks.addComponent.mock.calls.map(([c]) => c.name)).toEqual([
        "T",
        "NuxtLinkLocale",
      ]);
      expect(nuxtKitMocks.addServerImports).toHaveBeenCalledWith([
        { name: "useTranslation", from: "/resolved/./runtime/server/utils/useTranslation" },
      ]);
      expect(nuxtKitMocks.addServerPlugin).toHaveBeenCalledWith(
        "/resolved/./runtime/server/plugins/comvi",
      );
      expect(nuxtKitMocks.addRouteMiddleware).toHaveBeenCalledWith({
        name: "i18n",
        path: "/resolved/./runtime/middleware/i18n.global",
        global: true,
      });
    });

    it("the auto-imported useI18n and useFormat ARE @comvi/vue's", async () => {
      const runtime = await import("../src/runtime/composables/useI18n");
      const vue = await import("@comvi/vue");
      const format = await import("@comvi/vue/format");

      expect(runtime.useI18n).toBe(vue.useI18n);
      expect(runtime.useFormat).toBe(format.useFormat);
    });

    it("requires timeZone, naming the fix", async () => {
      const definition = (await importModule()) as any;
      vi.resetModules();
      const raw = (await import("../src/module")).default as any;

      await expect(
        raw.setup({ locales: ["en"], defaultLocale: "en" }, createNuxtStub()),
      ).rejects.toThrow(
        '[@comvi/nuxt] `comvi.timeZone` is required: the server and the browser must format dates in one zone. Add it to nuxt.config, e.g. `comvi: { timeZone: "UTC" }`.',
      );
      await expect(
        definition.setup({ locales: ["en"], timeZone: "Mars/Olympus" }, createNuxtStub()),
      ).rejects.toThrow('[@comvi/nuxt] `comvi.timeZone` "Mars/Olympus" is not a time zone.');
    });

    it("refuses a locale that is not a language tag at build time, by name", async () => {
      const moduleDefinition = await importModule();

      await expect(
        moduleDefinition.setup(
          { locales: ["en", "en_US!"], defaultLocale: "en" },
          createNuxtStub(),
        ),
      ).rejects.toThrow('[@comvi/nuxt] locale "en_US!" is not a BCP 47 language tag.');
    });

    it.each([
      ["defaultParams", { brand: "Comvi" }, "params of `t()`"],
      ["setup", "./comvi.setup.ts", "the `plugins` and `onError` options of `comvi.i18n.ts`"],
      ["apiKey", "k", "a private server route that reads its key from private `runtimeConfig`"],
      ["ns", ["admin"], "`namespaces`"],
      ["defaultNs", "common", "nothing: the default namespace is `default`"],
      ["icu", true, "nothing: ICU is the core's compiler"],
      ["basicHtmlTags", ["b"], "tag handlers, `components` or slots of `<T>`"],
    ])("a removed 0.7 option `%s` fails setup, naming what to write", async (key, value, use) => {
      const moduleDefinition = await importModule();

      await expect(
        moduleDefinition.setup({ locales: ["en"], [key]: value }, createNuxtStub()),
      ).rejects.toThrow(`[@comvi/nuxt] \`comvi.${key}\` is not an option: use ${use}.`);
    });

    it("writes the translation data into the generated options module, not into runtime config", async () => {
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();
      const data = {
        timeZone: "Europe/Kyiv",
        fallbackLocale: "en",
        namespaces: ["common"],
        formats: { number: { money: { style: "currency", currency: "EUR" } } },
        messages: { en: { home: { title: "Hello" } } },
      };
      await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", ...data }, nuxt);

      const contents = optionsTemplateContents()!;
      expect(contents).toContain("export const options = () => ({});");
      expect(contents).toContain(`export const config = ${JSON.stringify(data)};`);
      for (const key of Object.keys(data))
        expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty(key);
      // The Nitro build gets the same module under its own name.
      const [[hook, register]] = nuxt.hook.mock.calls.filter(
        ([name]: [string]) => name === "nitro:config",
      );
      expect(hook).toBe("nitro:config");
      const nitroConfig: { virtual?: Record<string, () => string> } = {};
      register(nitroConfig);
      expect(nitroConfig.virtual!["#comvi/options"]!()).toBe(contents);
    });

    it("imports the options file the module found, with a check of its default export", async () => {
      nuxtKitMocks.findPath.mockImplementation(
        async (specifier: string, { cwd }: { cwd: string }) =>
          specifier === "./comvi.i18n" && cwd === ABSENT_SRC_DIR ? "/app/comvi.i18n.ts" : null,
      );
      const moduleDefinition = await importModule();
      await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, createNuxtStub());

      const contents = optionsTemplateContents()!;
      expect(contents).toContain('import factory from "/app/comvi.i18n.ts";');
      expect(contents).toContain('if (typeof factory !== "function") throw new TypeError(');
      expect(contents).toContain("export const options = factory;");
    });

    it("an explicit i18nModule that does not resolve is a build error", async () => {
      const moduleDefinition = await importModule();

      await expect(
        moduleDefinition.setup(
          { locales: ["en"], defaultLocale: "en", i18nModule: "./nope.ts" },
          createNuxtStub(),
        ),
      ).rejects.toThrow('[@comvi/nuxt] Failed to resolve comvi i18nModule: "./nope.ts".');
    });

    it("names a comvi.i18n file it found but could not resolve", async () => {
      const dir = mkdtempSync(join(tmpdir(), "comvi-nuxt-near-miss-"));
      tempDirs.push(dir);
      writeFileSync(join(dir, "comvi.i18n.cts"), "");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const moduleDefinition = await importModule();
      const nuxt = createNuxtStub();
      nuxt.options.srcDir = dir;
      await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `Found "${join(dir, "comvi.i18n.cts")}" but could not resolve "./comvi.i18n"`,
        ),
      );
    });
  });
});
