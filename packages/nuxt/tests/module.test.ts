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
  addServerImportsDir: (...args: unknown[]) => nuxtKitMocks.addServerImportsDir(...args),
  addServerPlugin: (...args: unknown[]) => nuxtKitMocks.addServerPlugin(...args),
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
      head: true,
      defaultNs: "default",
      icu: false,
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
        fallbackLocale: "en",
        defaultParams: { formality: "formal" },
        messages: { en: { greeting: "Hello" } },
        apiKey: "secret-key",
        setup: "./comvi.setup.ts",
        localeCookie: { name: "locale_cookie", maxAge: 60 },
        basicHtmlTags: ["strong", "em"],
        head: false,
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi).toMatchObject({
      head: false,
      locales: ["en", "de"],
      localeObjects: {
        en: { code: "en" },
        de: { code: "de", name: "Deutsch" },
      },
      defaultLocale: "en",
      localePrefix: "as-needed",
      messages: { en: { greeting: "Hello" } },
      defaultNs: "common",
      fallbackLocale: "en",
      defaultParams: { formality: "formal" },
      basicHtmlTags: ["strong", "em"],
      localeCookie: { name: "locale_cookie", maxAge: 60, secure: true, sameSite: "lax" },
      localeDetection: { order: ["query", "cookie", "accept-language"] },
    });
    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("cookieName");
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
    // The per-request teardown is this plugin; unregistered, every request host
    // on the server leaks its plugin cleanups again.
    expect(nuxtKitMocks.addServerPlugin).toHaveBeenCalledWith(
      "/resolved/./runtime/server/plugins/request-cleanup",
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

  it("publishes the inline catalog as public runtime config `messages`, the key NUXT_PUBLIC_COMVI_MESSAGES overrides", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", messages: { en: { greeting: "Hello" } } },
      nuxt,
    );

    const publicComvi = nuxt.options.runtimeConfig.public.comvi as Record<string, unknown>;
    expect(publicComvi.messages).toEqual({ en: { greeting: "Hello" } });
    expect(publicComvi).not.toHaveProperty("translation");
    // Nuxt maps `runtimeConfig.public.<a>.<b>` to the env var NUXT_PUBLIC_<A>_<B>.
    const envNames = Object.keys(publicComvi).map(
      (key) => `NUXT_PUBLIC_COMVI_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`,
    );
    expect(envNames).toContain("NUXT_PUBLIC_COMVI_MESSAGES");
    expect(envNames).not.toContain("NUXT_PUBLIC_COMVI_TRANSLATION");
  });

  it("merges existing public runtime config and preserves runtime-only overrides", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = {
      messages: { en: { greeting: "Runtime" } },
      defaultNs: "runtime-default",
      fallbackLocale: ["uk", "en"],
      basicHtmlTags: ["strong"],
      localeCookie: { name: "runtime_locale", maxAge: 30 },
      extraPublicField: "keep-me",
    };

    await moduleDefinition.setup(
      {
        locales: ["en", "de"],
        defaultLocale: "en",
        messages: { en: { greeting: "Module" } },
        defaultNs: "module-default",
        fallbackLocale: "en",
        basicHtmlTags: ["em"],
        localeCookie: { name: "module_locale", maxAge: 60 },
      },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi).toMatchObject({
      locales: ["en", "de"],
      defaultLocale: "en",
      localePrefix: "as-needed",
      messages: { en: { greeting: "Runtime" } },
      defaultNs: "runtime-default",
      fallbackLocale: ["uk", "en"],
      basicHtmlTags: ["strong"],
      localeCookie: { name: "runtime_locale", maxAge: 30, secure: true, sameSite: "lax" },
      localeDetection: { order: ["query", "cookie", "accept-language"] },
      extraPublicField: "keep-me",
    });
    expect(nuxt.options.appConfig.comvi.routing.cookieName).toBe("runtime_locale");
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

  it("keeps the cookie and detection off, and app config names no cookie", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", localeCookie: false, localeDetection: false },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi.localeDetection).toBe(false);
    expect(nuxt.options.runtimeConfig.public.comvi.localeCookie).toBe(false);
    expect(nuxt.options.appConfig.comvi.routing.cookieName).toBe(false);
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

  it("leaves unset catalog options out of the public runtime config instead of writing undefined", async () => {
    // Nitro normalizes an `undefined` runtime-config value to `""`, and core
    // rejects `messages: ""` — every SSR page of an app that loads its
    // catalogs through a host loader answered 500. Absent keys stay absent.
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    const publicComvi = nuxt.options.runtimeConfig.public.comvi;
    for (const key of ["messages", "defaultParams", "basicHtmlTags"]) {
      expect(publicComvi).not.toHaveProperty(key);
    }
    expect(Object.values(publicComvi)).not.toContain(undefined);
  });

  it("drops an undefined value an existing public runtime config carries", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();
    nuxt.options.runtimeConfig.public.comvi = { messages: undefined };

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("messages");
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
      ns: ["common"],
    };

    await moduleDefinition.setup(input, nuxt);

    const { locales, defaultLocale, localePrefix, localeCookie, localeDetection, ns } =
      nuxt.options.runtimeConfig.public.comvi;
    expect({ locales, defaultLocale, localePrefix, localeCookie, localeDetection, ns }).toEqual(
      normalizeRoutingOptions(input, { cookieNameDefault: "i18n_locale" }),
    );
  });

  it("forwards comvi.ns into public runtime config", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", ns: ["common", "nav"] },
      nuxt,
    );

    expect(nuxt.options.runtimeConfig.public.comvi.ns).toEqual(["common", "nav"]);
  });

  it("leaves ns out of runtime config when it is unset", async () => {
    const moduleDefinition = await importModule();
    const nuxt = createNuxtStub();

    await moduleDefinition.setup({ locales: ["en"], defaultLocale: "en" }, nuxt);

    expect(nuxt.options.runtimeConfig.public.comvi).not.toHaveProperty("ns");
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
