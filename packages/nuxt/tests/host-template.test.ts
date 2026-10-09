// The `#build/comvi.host` template is generated TEXT, so module.test.ts can
// only assert what it says. This file executes it: both branches are written to
// disk and imported, which is the only way to prove the emitted code parses,
// resolves, and wires the host the way the option promises.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLoaderApi } from "@comvi/core";
import type { WrapperI18nInstance } from "@comvi/core";

type NuxtTemplateStub = { filename: string; write?: boolean; getContents: () => string };
type ResolvedTemplateStub = { filename: string; dst: string };

const nuxtKitMocks = {
  // The `@nuxt/kit` facade below forwards with a rest spread, so every mock
  // needs a rest-parameter signature; `addTemplate` is given the real argument
  // shape because the assertions below destructure `mock.calls`.
  createResolver: vi.fn((..._args: unknown[]) => ({
    resolve: (id: string) => `/resolved/${id}`,
  })),
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
  extendPages: (...args: unknown[]) => nuxtKitMocks.extendPages(...args),
}));

// The emitted template imports "@comvi/vue" / "@comvi/core" by bare specifier,
// so it has to live where those resolve: inside this package.
const workDir = mkdtempSync(join(process.cwd(), "node_modules", ".comvi-host-template-"));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

interface HostStub extends Record<string, unknown> {
  locale: string;
  addMessages: (translations: Record<string, Record<string, string>>) => void;
  getDefaultNamespace: () => string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

interface HostTemplate {
  createComviI18n: (options: Record<string, unknown>) => {
    core: HostStub;
    locale: { value: string };
  };
  createComviCore: (options?: Record<string, unknown>) => HostStub;
}

let moduleId = 0;
let prepareTypesHandlers: ((payload: TypeReferencePayload) => void)[] = [];

interface NuxtStub {
  hook: (name: string, handler: (payload: TypeReferencePayload) => void) => void;
  options: {
    runtimeConfig: { public: Record<string, unknown>; comvi: Record<string, unknown> };
    appConfig: Record<string, unknown>;
    build: { transpile: string[] };
    vite: { optimizeDeps: { include: string[] } };
  };
}

interface TypeReferencePayload {
  references?: { path: string }[];
}

interface ModuleDefinition {
  setup: (options: Record<string, unknown>, nuxt: NuxtStub) => Promise<void>;
}

/** Runs the module's setup, then writes + imports the generated host template. */
async function emitHostTemplate(
  hostModule?: string,
  extraOptions: Record<string, unknown> = {},
  nuxtOptions: { dev?: boolean } = {},
): Promise<HostTemplate & { source: string }> {
  vi.resetModules();
  // Dynamic on purpose: re-evaluated per case so its @nuxt/kit calls hit a fresh mock.
  const imported = await import("../src/module");
  // `defineNuxtModule` is the identity here, so the default export is the definition object.
  const moduleDefinition = imported.default as unknown as ModuleDefinition;

  await moduleDefinition.setup(
    {
      locales: ["en"],
      defaultLocale: "en",
      ...(hostModule ? { hostModule } : {}),
      ...extraOptions,
    },
    {
      hook: (name, handler) => {
        if (name === "prepare:types") prepareTypesHandlers.push(handler);
      },
      options: {
        ...nuxtOptions,
        runtimeConfig: { public: {}, comvi: {} },
        appConfig: {},
        build: { transpile: [] },
        vite: { optimizeDeps: { include: [] } },
      },
    },
  );

  const template = nuxtKitMocks.addTemplate.mock.calls.find(
    ([candidate]) => candidate.filename === "comvi.host.mjs",
  )?.[0] as NuxtTemplateStub;

  const file = join(workDir, `host-${moduleId++}.mjs`);
  const source = template.getContents();
  writeFileSync(file, source);
  // Dynamic by necessity: the specifier is a file this test just generated.
  return { ...((await import(pathToFileURL(file).href)) as HostTemplate), source };
}

function writeHostModule(body: string): string {
  const file = join(workDir, `user-host-${moduleId++}.mjs`);
  writeFileSync(file, body);
  return file;
}

const globals = globalThis as unknown as Record<string, unknown>;

describe("generated #build/comvi.host template", () => {
  let previousComviGlobal: unknown;

  beforeEach(() => {
    for (const mock of Object.values(nuxtKitMocks)) mock.mockReset();
    nuxtKitMocks.createResolver.mockReturnValue({ resolve: (id: string) => `/resolved/${id}` });
    nuxtKitMocks.findPath.mockResolvedValue(null);
    // `addTemplate` RESOLVES a template, and the module reads `.dst` off the
    // type-check template to register it as a tsconfig reference.
    nuxtKitMocks.addTemplate.mockImplementation((candidate) => ({
      filename: candidate.filename,
      dst: `/build/${candidate.filename}`,
    }));
    prepareTypesHandlers = [];

    previousComviGlobal = globals.__COMVI__;
    delete globals.__COMVI__;
  });

  afterEach(() => {
    if (previousComviGlobal === undefined) {
      delete globals.__COMVI__;
    } else {
      globals.__COMVI__ = previousComviGlobal;
    }
  });

  it("builds core's BASE host on the default branch", async () => {
    const { createComviI18n, createComviCore } = await emitHostTemplate();

    const i18n = createComviI18n({ locale: "en", exposeGlobal: false });
    expect(i18n.locale.value).toBe("en");
    // Absent from the module graph, not merely disabled: a capability is a `hostModule` import.
    expect(i18n.core.registerLoader).toBeUndefined();
    expect(i18n.core.registerPlugin).toBeUndefined();

    const core = createComviCore({ locale: "de", exposeGlobal: false });
    expect(core.locale).toBe("de");
    expect(core.reloadMessages).toBeUndefined();
    expect(core.getLoader).toBeUndefined();
    // The wrapper seam agrees, so the absence is loud instead of a TypeError later.
    expect(hasLoaderApi(core as unknown as WrapperI18nInstance)).toBe(false);
  });

  it("carries the ICU detector on the default branch", async () => {
    const { createComviCore } = await emitHostTemplate();

    const core = createComviCore({ locale: "en" });

    // `__DEV__` is true here, so the eager ingestion check throws; production
    // renders the braced segment literally and reports the same code via onError.
    expect(() =>
      core.addMessages({
        en: { cart: "{count, plural, one {# item} other {# items}}" },
      }),
    ).toThrow(expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }));
  });

  it("compiles ICU on the default branch when icu is true", async () => {
    const { createComviI18n, createComviCore } = await emitHostTemplate(undefined, { icu: true });

    // Counterpart to the detector test: proves `compiler: icuCompiler` is wired, not just emitted.
    const core = createComviCore({ locale: "en" });
    core.addMessages({
      en: { cart: "{count, plural, one {# item} other {# items}}" },
    });
    expect(core.t("cart", { count: 5 })).toBe("5 items");
    expect(core.t("cart", { count: 1 })).toBe("1 item");

    // Same template function builds both, so SSR and client share one compiler.
    const i18n = createComviI18n({ locale: "en", exposeGlobal: false });
    i18n.core.addMessages({
      en: { cart: "{count, plural, one {# item} other {# items}}" },
    });
    expect(i18n.core.t("cart", { count: 5 })).toBe("5 items");
  });

  it("introduces no browser global on the default branch", async () => {
    const { createComviCore } = await emitHostTemplate();

    createComviCore({ locale: "en" });

    // Discovery is `@comvi/core/devtools`, composed in explicitly; the SSR graph runs this module.
    expect(globals.__COMVI__).toBeUndefined();
  });

  it("wires the user host through createI18nFromCore on the hostModule branch", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

export const built = [];

export default () => {
  const host = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
  built.push(host);
  return host;
};
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const { createComviI18n, createComviCore } = await emitHostTemplate("./comvi.host.mjs");
    const { built } = (await import(pathToFileURL(hostPath).href)) as { built: unknown[] };

    // The factory is not called until something is constructed…
    expect(built).toHaveLength(0);

    const core = createComviCore();
    expect(built).toHaveLength(1);
    expect(core).toBe(built[0]);
    // Exactly the capabilities the factory added: loader yes, plugin host no.
    expect(typeof core.reloadMessages).toBe("function");
    expect(core.registerPlugin).toBeUndefined();

    // …and every construction gets a FRESH host (one per request on the server).
    const i18n = createComviI18n({ locale: "en", ssrLocale: "de" });
    expect(built).toHaveLength(2);
    expect(i18n.core).toBe(built[1]);
    expect(i18n.core).not.toBe(core);

    // ssrLocale is nuxt's resolved render locale: the host follows it.
    expect(i18n.core.locale).toBe("de");
    expect(i18n.locale.value).toBe("de");

    // The capability proxies are absent from the wrapper on this branch too.
    expect("reloadMessages" in i18n).toBe(false);
  });

  it("hands nuxt's resolved options to the host factory", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";

export const seen = [];

export default (options) => {
  seen.push(options);
  return createI18n({ ...options, exposeGlobal: false });
};
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const { createComviI18n, createComviCore } = await emitHostTemplate("./comvi.host.mjs");
    // Dynamic by necessity: the specifier is a file this test just generated.
    const { seen } = (await import(pathToFileURL(hostPath).href)) as {
      seen: Record<string, unknown>[];
    };

    // Migrating to `hostModule` must not silently drop the nuxt.config options.
    const core = createComviCore({
      locale: "de",
      fallbackLocale: "en",
      defaultNs: "admin",
      apiKey: "k",
    });
    expect(seen[0]).toMatchObject({
      locale: "de",
      fallbackLocale: "en",
      defaultNs: "admin",
      apiKey: "k",
    });
    expect(core.locale).toBe("de");
    expect(core.getDefaultNamespace()).toBe("admin");

    // On the client branch the render locale wins over the configured one.
    const i18n = createComviI18n({ locale: "en", ssrLocale: "uk", defaultNs: "admin" });
    expect(seen[1]).toMatchObject({ locale: "uk", defaultNs: "admin" });
    expect(i18n.core.locale).toBe("uk");
    expect(i18n.locale.value).toBe("uk");
  });

  it("renders a key from comvi.messages on the default branch", async () => {
    // The two-line module-options floor: no hostModule, therefore no loader,
    // therefore this inline catalog is the only one the host will ever have.
    const { createComviI18n, createComviCore } = await emitHostTemplate();

    const i18n = createComviI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello" } },
    });
    expect(i18n.core.t("greeting")).toBe("Hello");

    // Same option, same key, on the shape the per-request server host is.
    const core = createComviCore({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello" } },
    });
    expect(core.t("greeting")).toBe("Hello");
  });

  it("flattens a NESTED comvi.messages catalog on the base host", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createComviCore } = await emitHostTemplate();

    const core = createComviCore({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { nav: { home: "Home" } } },
    });

    // The base host flattens every catalog it ingests, so the module's own
    // generated host resolves a dotted key from a nested `comvi.messages`
    // with no capability composed and nothing to warn about. This pairs the
    // nuxt option with core's guarantee: the two construction paths cannot
    // disagree about what a nested catalog means.
    expect(core.t("nav.home")).toBe("Home");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws a named error when the host factory returns no host", async () => {
    nuxtKitMocks.findPath.mockResolvedValue(writeHostModule("export default () => undefined;\n"));
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    // Regression: a factory missing its `return` used to fail deep inside createI18nFromCore.
    expect(() => createComviCore()).toThrow(
      "[@comvi/nuxt] comvi hostModule must default-export a factory returning a core instance",
    );
  });

  it("rejects a factory that returns a VueI18n instead of a core host", async () => {
    // The defect the guard exists for: a VueI18n HAS a t(), so a t-only check
    // passed it to createI18nFromCore and a wrapper got wrapped a second time.
    // The old message even named `createI18n`, which in @comvi/vue returns
    // exactly this.
    nuxtKitMocks.findPath.mockResolvedValue(
      writeHostModule(`
import { createI18n } from "@comvi/vue";

export default (options) => createI18n({ ...options, exposeGlobal: false });
`),
    );
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    expect(() => createComviCore({ locale: "en" })).toThrow(
      '[@comvi/nuxt] comvi hostModule must default-export a factory returning a core instance, not a VueI18n. Use createI18n from "@comvi/nuxt/host", e.g. createI18n(options).use(loader(map)).',
    );
  });

  it("accepts a factory that returns a core host", async () => {
    // The counterpart: the tightened guard must not reject what the recipe
    // actually tells a reader to write.
    nuxtKitMocks.findPath.mockResolvedValue(
      writeHostModule(`
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

export default (options) => createI18n({ ...options, exposeGlobal: false }).use(attachLoader);
`),
    );
    const { createComviI18n, createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    const core = createComviCore({ locale: "en", messages: { en: { greeting: "Hello" } } });
    expect(core.t("greeting")).toBe("Hello");
    expect(typeof core.reloadMessages).toBe("function");

    // And the wrapper branch wraps it exactly once.
    const i18n = createComviI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    expect(i18n.core.t("greeting")).toBe("Hello");
    expect((i18n.core as unknown as { core?: unknown }).core).toBeUndefined();
  });

  it("hands comvi.messages to a hostModule factory in its resolved options", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";

export const seen = [];

export default (options) => {
  seen.push(options);
  return createI18n({ ...options, exposeGlobal: false });
};
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");
    // Dynamic by necessity: the specifier is a file this test just generated.
    const { seen } = (await import(pathToFileURL(hostPath).href)) as {
      seen: Record<string, unknown>[];
    };

    const core = createComviCore({ locale: "en", messages: { en: { greeting: "Hello" } } });

    expect(seen[0]).toMatchObject({ messages: { en: { greeting: "Hello" } } });
    expect(core.t("greeting")).toBe("Hello");
  });

  it("compiles ICU through a hostModule factory that spreads its options when icu is true", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";

export default (options) => createI18n({ ...options, exposeGlobal: false });
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createComviI18n, createComviCore } = await emitHostTemplate("./comvi.host.mjs", {
      icu: true,
    });

    // The rule used to be "hostModule wins, icu is ignored with a warning".
    expect(warnSpy).not.toHaveBeenCalled();

    const core = createComviCore({ locale: "en" });
    core.addMessages({ en: { cart: "{count, plural, one {# item} other {# items}}" } });
    expect(core.t("cart", { count: 5 })).toBe("5 items");

    // Both constructions, so SSR and hydration compile the same catalog the same way.
    const i18n = createComviI18n({ locale: "en", ssrLocale: "en" });
    i18n.core.addMessages({ en: { cart: "{count, plural, one {# item} other {# items}}" } });
    expect(i18n.core.t("cart", { count: 1 })).toBe("1 item");
  });

  it("lets a hostModule factory's own compiler win over icu by key order", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

export const seen = [];

// A compiler that treats every braced segment as literal text: the most
// visible way to prove which one the host ended up with.
const literal = { makeArgToken: () => undefined };

export default (options) => {
  seen.push(options.compiler === icuCompiler);
  return createI18n({ ...options, compiler: literal, exposeGlobal: false });
};
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs", { icu: true });
    const { seen } = (await import(pathToFileURL(hostPath).href)) as { seen: boolean[] };

    const core = createComviCore({ locale: "en" });

    // ICU arrived in the resolved options…
    expect(seen).toEqual([true]);
    // …and the factory's own `compiler`, written after the spread, is the one in use.
    core.addMessages({ en: { cart: "{count, plural, one {# item} other {# items}}" } });
    expect(core.t("cart", { count: 5 })).toBe("{count, plural, one {# item} other {# items}}");
  });

  it("hands a hostModule factory no compiler when icu is off", async () => {
    const hostPath = writeHostModule(`
import { createI18n } from "@comvi/core";

export const seen = [];

export default (options) => {
  seen.push("compiler" in options);
  return createI18n({ ...options, exposeGlobal: false });
};
`);
    nuxtKitMocks.findPath.mockResolvedValue(hostPath);
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");
    const { seen } = (await import(pathToFileURL(hostPath).href)) as { seen: boolean[] };

    const core = createComviCore({ locale: "en" });

    // Not `compiler: undefined` either: the key is absent, as the option is off.
    expect(seen).toEqual([false]);
    // The simple compiler, so the detector fires as on the default branch.
    expect(() =>
      core.addMessages({ en: { cart: "{count, plural, one {# item} other {# items}}" } }),
    ).toThrow(expect.objectContaining({ code: "E_ICU_SYNTAX" }));
  });

  it("throws a named error when the host module's default export is not a function", async () => {
    // A missing default is an ESM link error; a WRONG default is the reachable shape.
    nuxtKitMocks.findPath.mockResolvedValue(writeHostModule("export default {};\n"));
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    expect(() => createComviCore()).toThrow(
      "[@comvi/nuxt] comvi hostModule must export a default function returning an i18n instance.",
    );
  });
});

// The `.host.mjs` template decides which host is BUILT; this one decides how it
// is TYPED. `comvi.setup`'s host was an unverified assertion about a different
// file reached by a string path — a hook typed `NuxtI18nSetup<I18n &
// I18nLoaderApi>` compiled whether or not `comvi.host` composed the loader, and
// a base host gets no capability shim, so the call threw a raw `TypeError`.
// These cases pin the text that turns the assertion into a compile-time check.
describe("generated types/comvi-host.ts declaration", () => {
  beforeEach(() => {
    for (const mock of Object.values(nuxtKitMocks)) mock.mockReset();
    nuxtKitMocks.createResolver.mockReturnValue({ resolve: (id: string) => `/resolved/${id}` });
    nuxtKitMocks.findPath.mockResolvedValue(null);
    nuxtKitMocks.addTemplate.mockImplementation((candidate) => ({
      filename: candidate.filename,
      dst: `/build/${candidate.filename}`,
    }));
    prepareTypesHandlers = [];
  });

  /**
   * Runs the module's setup with the two conventions resolved independently —
   * a blanket `mockResolvedValue` would hand the host file to the setup branch
   * too — and returns the generated declaration's text.
   */
  async function emitTypeTemplate(
    paths: { host?: string; setup?: string } = {},
    extraOptions: Record<string, unknown> = {},
  ): Promise<string> {
    nuxtKitMocks.findPath.mockImplementation(async (specifier: string) =>
      specifier === "./comvi.host"
        ? (paths.host ?? null)
        : specifier === "./comvi.setup"
          ? (paths.setup ?? null)
          : null,
    );

    vi.resetModules();
    // Dynamic on purpose: re-evaluated per case so its @nuxt/kit calls hit a fresh mock.
    const imported = await import("../src/module");
    const moduleDefinition = imported.default as unknown as ModuleDefinition;

    await moduleDefinition.setup(
      { locales: ["en"], defaultLocale: "en", ...extraOptions },
      {
        hook: (name, handler) => {
          if (name === "prepare:types") prepareTypesHandlers.push(handler);
        },
        options: {
          runtimeConfig: { public: {}, comvi: {} },
          appConfig: {},
          build: { transpile: [] },
          vite: { optimizeDeps: { include: [] } },
        },
      },
    );

    const template = nuxtKitMocks.addTemplate.mock.calls.find(
      ([candidate]) => candidate.filename === "types/comvi-host.ts",
    )?.[0] as NuxtTemplateStub;

    return template.getContents();
  }

  it("reads the host type off the factory, and does not re-declare it", async () => {
    const contents = await emitTypeTemplate({ host: "/app/comvi.host.ts" });

    // The whole point of U4: the type comes FROM the file the runtime template
    // imports, so the two cannot drift. A hand-written wrapper type here would
    // be the same unverified assertion, one file further along.
    expect(contents).toContain(
      'type ComviResolvedInstance = ReturnType<typeof import("/app/comvi.host").default>;',
    );
    // …published through the registry, so `NuxtI18nSetup`'s DEFAULT type
    // argument is the real host and the bare `satisfies NuxtI18nSetup` is typed
    // rather than merely accepted.
    expect(contents).toContain('declare module "@comvi/nuxt" {');
    expect(contents).toContain("interface ComviNuxtInstanceRegistry {");
    expect(contents).toContain("instance: ComviResolvedInstance;");
  });

  it("names core's BASE host when there is no host module", async () => {
    const contents = await emitTypeTemplate();

    // The default branch builds core's base host, and saying so is what makes a
    // hook that calls a capability on it a compile error instead of a TypeError.
    expect(contents).toContain('type ComviResolvedInstance = import("@comvi/nuxt").I18n;');
    expect(contents).not.toContain("ReturnType<typeof import(");
  });

  it("strips the extension from both resolved paths", async () => {
    // `import("…/comvi.host.ts")` needs `allowImportingTsExtensions`, which an
    // app does not have, and `…/comvi.host.js` next to a `.d.ts` resolves to
    // the wrong file. Every extension nuxt's own resolution tries must go.
    for (const extension of ["ts", "mts", "cts", "js", "mjs", "cjs", "tsx", "jsx"]) {
      const contents = await emitTypeTemplate({
        host: `/app/comvi.host.${extension}`,
        setup: `/app/comvi.setup.${extension}`,
      });
      expect(contents).toContain('import("/app/comvi.host").default');
      expect(contents).toContain('import("/app/comvi.setup").default');
      expect(contents).not.toContain(`.${extension}").default`);
    }
  });

  it("puts comvi.setup's default export through the cross-check", async () => {
    const contents = await emitTypeTemplate({
      host: "/app/comvi.host.ts",
      setup: "/app/comvi.setup.ts",
    });

    expect(contents).toContain(
      'export type ComviSetupMatchesInstance = import("@comvi/nuxt").CheckedNuxtI18nSetup<',
    );
    expect(contents).toContain("  ComviResolvedInstance,");
    expect(contents).toContain('  typeof import("/app/comvi.setup").default');
  });

  it("emits no cross-check when there is no setup file", async () => {
    const contents = await emitTypeTemplate({ host: "/app/comvi.host.ts" });

    // Nothing to check, and naming a file that is not there would be a
    // "cannot find module" reported against generated code.
    expect(contents).not.toContain("ComviSetupMatchesInstance");
    expect(contents).not.toContain("comvi.setup");
  });

  it("is written to disk and referenced from the generated types", async () => {
    await emitTypeTemplate({ host: "/app/comvi.host.ts", setup: "/app/comvi.setup.ts" });

    // A `.ts`, not the `.d.ts` `addTypeTemplate` insists on: every nuxt
    // tsconfig sets `skipLibCheck: true`, which silences every error inside a
    // declaration file — including the one this file exists to raise. And a
    // template is VIRTUAL unless `write` says otherwise, so without both of
    // these the cross-check is a file tsc never opens.
    expect(nuxtKitMocks.addTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "types/comvi-host.ts", write: true }),
    );

    const payload: { references?: { path: string }[] } = {};
    expect(prepareTypesHandlers).toHaveLength(1);
    for (const handler of prepareTypesHandlers) handler(payload);
    expect(payload.references).toEqual([{ path: "/build/types/comvi-host.ts" }]);
  });

  it("keeps the reference when a payload already carries some", async () => {
    await emitTypeTemplate({ host: "/app/comvi.host.ts" });

    // Every other module writes into the same array; clobbering it would drop
    // their types and be blamed on them.
    const payload = { references: [{ path: "/build/types/other.d.ts" }] };
    for (const handler of prepareTypesHandlers) handler(payload);
    expect(payload.references).toEqual([
      { path: "/build/types/other.d.ts" },
      { path: "/build/types/comvi-host.ts" },
    ]);
  });

  it("declares the host the same way whether or not icu is on", async () => {
    // `comvi.icu` changes the compiler the factory is HANDED, not the type it
    // returns, so the declaration must not fork on it.
    const off = await emitTypeTemplate({ host: "/app/comvi.host.ts" });
    const on = await emitTypeTemplate({ host: "/app/comvi.host.ts" }, { icu: true });
    expect(on).toBe(off);
  });
});

describe("generated #build/comvi.host template: one host per call", () => {
  beforeEach(() => {
    for (const mock of Object.values(nuxtKitMocks)) mock.mockReset();
    nuxtKitMocks.createResolver.mockReturnValue({ resolve: (id: string) => `/resolved/${id}` });
    nuxtKitMocks.addTemplate.mockImplementation((candidate) => ({
      filename: candidate.filename,
      dst: `/build/${candidate.filename}`,
    }));
    prepareTypesHandlers = [];
  });

  /** A factory that hands every caller the same module-level host. */
  function singletonHostModule() {
    return writeHostModule(`
import { createI18n } from "@comvi/core";

const shared = createI18n({ locale: "en", exposeGlobal: false });

export default () => shared;
`);
  }

  it("throws a named error in development when the factory returns the same host twice", async () => {
    nuxtKitMocks.findPath.mockResolvedValue(singletonHostModule());
    const { createComviCore, createComviI18n } = await emitHostTemplate(
      "./comvi.host.mjs",
      {},
      { dev: true },
    );

    createComviI18n({ locale: "en" });
    expect(() => createComviCore({ locale: "en" })).toThrow(
      "[@comvi/nuxt] comvi hostModule returned an instance it already returned. Every call builds a separate instance (the client, and each server request), so return a new instance from createI18n on every call.",
    );
  });

  it("lets a factory that builds a new host every call through in development", async () => {
    nuxtKitMocks.findPath.mockResolvedValue(
      writeHostModule(`
import { createI18n } from "@comvi/core";

export default (options) => createI18n({ ...options, exposeGlobal: false });
`),
    );
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs", {}, { dev: true });

    const first = createComviCore({ locale: "en" });
    expect(createComviCore({ locale: "en" })).not.toBe(first);
  });

  it("emits no guard in a production build", async () => {
    nuxtKitMocks.findPath.mockResolvedValue(singletonHostModule());
    const { createComviCore, source } = await emitHostTemplate(
      "./comvi.host.mjs",
      {},
      {
        dev: false,
      },
    );

    expect(createComviCore({ locale: "en" })).toBe(createComviCore({ locale: "en" }));
    expect(source).not.toContain("WeakSet");
  });
});
