import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  addServerImportsDir: vi.fn(),
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
  addServerImportsDir: (...args: unknown[]) => nuxtKitMocks.addServerImportsDir(...args),
  addRouteMiddleware: (...args: unknown[]) => nuxtKitMocks.addRouteMiddleware(...args),
  extendPages: (handler: (pages: NuxtPage[]) => void) => {
    extendPagesHandler = handler;
    nuxtKitMocks.extendPages(handler);
  },
}));

function createNuxtStub() {
  return {
    // The module registers the generated `types/comvi-host.ts` as a tsconfig
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

async function importModule() {
  vi.resetModules();
  return (await import("../src/module")).default as any;
}

/** Templates are looked up by filename; their registration order is not a contract. */
function template(filename: string) {
  return nuxtKitMocks.addTemplate.mock.calls.find(
    ([candidate]) => candidate.filename === filename,
  )?.[0];
}

const setupTemplateContents = () => template("comvi.setup.mjs")?.getContents();
const hostTemplateContents = () => template("comvi.host.mjs")?.getContents();

/**
 * `findPath` is consulted for BOTH conventions now, so a blanket
 * `mockResolvedValue(path)` would hand the setup file to the host branch too.
 * Resolve one specifier only, and nothing else.
 */
function resolveOnly(...pairs: Array<[specifier: string, path: string]>) {
  nuxtKitMocks.findPath.mockImplementation(
    async (specifier: string) => pairs.find(([wanted]) => wanted === specifier)?.[1] ?? null,
  );
}

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
    nuxtKitMocks.addServerImportsDir.mockReset();
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
    resolveOnly(["./comvi.setup.ts", "/app/comvi.setup.ts"]);

    await moduleDefinition.setup(
      {
        locales: ["en", { code: "de", name: "Deutsch" }],
        defaultLocale: "en",
        localePrefix: "as-needed",
        defaultNs: "common",
        fallbackLanguage: "en",
        defaultParams: { formality: "formal" },
        translation: { en: { greeting: "Hello" } },
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
      translation: { en: { greeting: "Hello" } },
      defaultNs: "common",
      fallbackLocale: "en",
      defaultParams: { formality: "formal" },
      basicHtmlTags: ["strong", "em"],
    });
    // Both were documented with CDN examples and read by no runtime code; the
    // module loads nothing on the app's behalf, so they are gone rather than
    // wired. A stale 0.4 config must not resurrect them through this object.
    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("cdnUrl");
    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("apiBaseUrl");
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
    resolveOnly(["./comvi.setup", "/app/comvi.setup.ts"]);

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
        options.cwd === ABSENT_ROOT_DIR && options.type === "file" ? "/app/comvi.setup.ts" : null,
    );

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxtKitMocks.findPath).toHaveBeenNthCalledWith(1, "./comvi.setup", {
      cwd: ABSENT_SRC_DIR,
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
    resolveOnly(["./comvi.setup", "/app/comvi.setup.ts"]);

    await moduleDefinition.setup(
      {
        locales: ["en"],
        defaultLocale: "en",
      },
      nuxt,
    );

    expect(setupTemplateContents()).toContain('import userSetup from "/app/comvi.setup.ts";');
  });

  it("names the near-missed file when comvi.setup auto-detection resolved nothing", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A REAL tree, because the probe reads the directory. `findPath` never
    // tries `.cjs`, so the file is present and still unreachable — the exact
    // shape that used to produce an empty `runComviSetup() {}` with no
    // explanation anywhere.
    const srcDir = mkdtempSync(join(tmpdir(), "comvi-nuxt-near-miss-"));
    tempDirs.push(srcDir);
    writeFileSync(join(srcDir, "app.vue"), "");
    writeFileSync(join(srcDir, "comvi.setup.cjs"), "");
    nuxt.options.srcDir = srcDir;

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(setupTemplateContents()).toContain("runComviSetup() {}");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain(`Found "${join(srcDir, "comvi.setup.cjs")}"`);
    expect(message).toContain('could not resolve "./comvi.setup"');
    expect(message).toContain(srcDir);
    expect(message).toContain("the comvi.setup hook is EMPTY");
  });

  it("does not report a comvi.setup.d.ts, a .bak or a directory as a near miss", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Each of these starts with "comvi.setup" and none is a hook Nuxt could
    // have resolved: a prefix probe reported all three, and the reader went
    // looking for a hook that was never there.
    const srcDir = mkdtempSync(join(tmpdir(), "comvi-nuxt-not-near-miss-"));
    tempDirs.push(srcDir);
    writeFileSync(join(srcDir, "comvi.setup.d.ts"), "");
    writeFileSync(join(srcDir, "comvi.setup.ts.bak"), "");
    mkdirSync(join(srcDir, "comvi.setup.cjs"));
    nuxt.options.srcDir = srcDir;

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(setupTemplateContents()).toContain("runComviSetup() {}");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("auto-detects ./comvi.host when hostModule is omitted and logs the path", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveOnly(["./comvi.host", "/app/comvi.host.ts"]);

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    // The composed branch, from a file nuxt.config never named…
    expect(hostTemplateContents()).toContain('import hostFactory from "/app/comvi.host.ts";');
    expect(hostTemplateContents()).not.toContain('from "@comvi/core"');
    // …which is exactly why the path is said out loud at build time.
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [message] = infoSpy.mock.calls[0] as [string];
    expect(message).toContain('"/app/comvi.host.ts"');
    expect(message).toContain("auto-detected ./comvi.host");
    expect(message).toContain("`hostModule`");
  });

  it("looks the conventional host up in srcDir before rootDir", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    vi.spyOn(console, "info").mockImplementation(() => {});
    nuxtKitMocks.findPath.mockImplementation(async (specifier: string, options: { cwd: string }) =>
      specifier === "./comvi.host" && options.cwd === ABSENT_ROOT_DIR
        ? "/root/comvi.host.ts"
        : null,
    );

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxtKitMocks.findPath).toHaveBeenCalledWith("./comvi.host", {
      cwd: ABSENT_SRC_DIR,
      type: "file",
    });
    expect(hostTemplateContents()).toContain('import hostFactory from "/root/comvi.host.ts";');
  });

  it("lets an explicit hostModule win over a conventional comvi.host", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveOnly(
      ["./custom.host.ts", "/app/custom.host.ts"],
      ["./comvi.host", "/app/comvi.host.ts"],
    );

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", hostModule: "./custom.host.ts" },
      nuxt,
    );

    expect(hostTemplateContents()).toContain('import hostFactory from "/app/custom.host.ts";');
    expect(hostTemplateContents()).not.toContain("/app/comvi.host.ts");
    // The convention is not even consulted, and an explicit path is not "stray".
    expect(nuxtKitMocks.findPath).not.toHaveBeenCalledWith("./comvi.host", expect.anything());
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("names the near-missed file when comvi.host auto-detection resolved nothing", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const srcDir = mkdtempSync(join(tmpdir(), "comvi-nuxt-host-near-miss-"));
    tempDirs.push(srcDir);
    writeFileSync(join(srcDir, "comvi.host.cjs"), "");
    // A `.d.ts` neighbour of the host file must not be the one reported either.
    writeFileSync(join(srcDir, "comvi.host.d.ts"), "");
    nuxt.options.srcDir = srcDir;

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    // The consequence of the miss: the BASE host, with none of the file's capabilities.
    expect(hostTemplateContents()).toContain('import { createI18n } from "@comvi/vue";');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain(`Found "${join(srcDir, "comvi.host.cjs")}"`);
    expect(message).toContain('could not resolve "./comvi.host"');
    expect(message).toContain(srcDir);
    expect(message).toContain("the app runs on the BASE host");
    expect(message).toContain("`hostModule`");
  });

  it("logs nothing about the host when no comvi.host file exists", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(hostTemplateContents()).toContain('import { createI18n } from "@comvi/vue";');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
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
    expect(contents).not.toContain(".use(");
    expect(contents).not.toContain("compiler");
  });

  it("emits the ICU compiler into the default branch when icu is true", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en", icu: true }, nuxt);

    const contents = hostTemplateContents();

    // `compiler` is a constructor argument, so `.use()` cannot pipe it on afterwards.
    expect(contents).toContain('import { icuCompiler } from "@comvi/core/icu";');
    // Both hosts, or SSR and hydration compile the same catalog with two compilers.
    expect(contents).toContain("createI18n({ ...options, compiler: icuCompiler })");
    expect(contents).toContain("createCore({ ...options, compiler: icuCompiler })");
    expect(contents).toContain('import { createI18n } from "@comvi/vue";');
    expect(contents).not.toContain("createI18nFromCore");
    expect(contents).not.toContain(".use(");
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

  it("emits compiler: icuCompiler into the factory options when icu is true with hostModule", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    resolveOnly(["./comvi.host.ts", "/app/comvi.host.ts"]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", icu: true, hostModule: "./comvi.host.ts" },
      nuxt,
    );

    // The option means the same thing on both branches now: nothing to warn about.
    expect(warnSpy).not.toHaveBeenCalled();

    const contents = hostTemplateContents();

    expect(contents).toContain('import hostFactory from "/app/comvi.host.ts";');
    expect(contents).toContain('import { createI18nFromCore } from "@comvi/vue";');
    expect(contents).toContain('import { icuCompiler } from "@comvi/core/icu";');
    // The compiler is the LAST key: `{ ...options }` gets it, `{ ...options, compiler }` overrides it.
    expect(contents).toContain("hostFactory({ ...options, compiler: icuCompiler })");
    expect(contents).not.toContain("hostFactory(options)");
  });

  it("emits no ICU import on the hostModule branch when icu is off", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    resolveOnly(["./comvi.host.ts", "/app/comvi.host.ts"]);

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", icu: false, hostModule: "./comvi.host.ts" },
      nuxt,
    );

    const contents = hostTemplateContents();

    // Same codegen rule as the default branch: off means absent from the graph.
    expect(contents).not.toContain("@comvi/core/icu");
    expect(contents).not.toContain("icuCompiler");
    expect(contents).toContain("hostFactory(options)");
  });

  it("emits the composed-host branch and never imports @comvi/core itself when hostModule is set", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    resolveOnly(["./comvi.host.ts", "/app/comvi.host.ts"]);

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
    // The guard names the import that FIXES it, and it is the module's own
    // subpath — @comvi/vue's createI18n is the wrapper the guard rejects.
    expect(contents).toContain("must default-export a factory returning a core HOST");
    expect(contents).toContain('createI18n from "@comvi/nuxt/host"');
    expect(contents).toContain("createI18n(options).use(loader(map))");
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
      translation: { en: { greeting: "Runtime" } },
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
        translation: { en: { greeting: "Module" } },
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
      translation: { en: { greeting: "Runtime" } },
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
