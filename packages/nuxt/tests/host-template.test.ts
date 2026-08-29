// The `#build/comvi.host` template is generated TEXT, so module.test.ts can
// only assert what it says. This file executes it: both branches are written to
// disk and imported, which is the only way to prove the emitted code parses,
// resolves, and wires the host the way the option promises.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLoaderApi } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";

const nuxtKitMocks = {
  createResolver: vi.fn(() => ({ resolve: (id: string) => `/resolved/${id}` })),
  findPath: vi.fn(),
  addPlugin: vi.fn(),
  addTemplate: vi.fn(),
  addImports: vi.fn(),
  addComponent: vi.fn(),
  addServerImportsDir: vi.fn(),
  addRouteMiddleware: vi.fn(),
  extendPages: vi.fn(),
};

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
  extendPages: (...args: unknown[]) => nuxtKitMocks.extendPages(...args),
}));

// The emitted template imports "@comvi/vue" / "@comvi/core" by bare specifier,
// so it has to live where those resolve: inside this package.
const workDir = mkdtempSync(join(process.cwd(), "node_modules", ".comvi-host-template-"));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

interface HostStub extends Record<string, unknown> {
  locale: string;
  addTranslations: (translations: Record<string, Record<string, string>>) => void;
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

interface NuxtStub {
  options: {
    runtimeConfig: { public: Record<string, unknown>; comvi: Record<string, unknown> };
    appConfig: Record<string, unknown>;
    build: { transpile: string[] };
    vite: { optimizeDeps: { include: string[] } };
  };
}

interface ModuleDefinition {
  setup: (options: Record<string, unknown>, nuxt: NuxtStub) => Promise<void>;
}

/** Runs the module's setup, then writes + imports the generated host template. */
async function emitHostTemplate(
  hostModule?: string,
  extraOptions: Record<string, unknown> = {},
): Promise<HostTemplate> {
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
      options: {
        runtimeConfig: { public: {}, comvi: {} },
        appConfig: {},
        build: { transpile: [] },
        vite: { optimizeDeps: { include: [] } },
      },
    },
  );

  const template = nuxtKitMocks.addTemplate.mock.calls.find(
    ([candidate]: [{ filename: string }]) => candidate.filename === "comvi.host.mjs",
  )?.[0] as { getContents: () => string };

  const file = join(workDir, `host-${moduleId++}.mjs`);
  writeFileSync(file, template.getContents());
  // Dynamic by necessity: the specifier is a file this test just generated.
  return (await import(pathToFileURL(file).href)) as HostTemplate;
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
    expect(i18n.core.use).toBeUndefined();

    const core = createComviCore({ locale: "de", exposeGlobal: false });
    expect(core.locale).toBe("de");
    expect(core.reloadTranslations).toBeUndefined();
    expect(core.getLoader).toBeUndefined();
    // The wrapper seam agrees, so the absence is loud instead of a TypeError later.
    expect(hasLoaderApi(core as unknown as WrapperI18nHost)).toBe(false);
  });

  it("carries the ICU detector on the default branch", async () => {
    const { createComviCore } = await emitHostTemplate();

    const core = createComviCore({ locale: "en" });

    // `__DEV__` is true here, so the eager ingestion check throws; production
    // renders the braced segment literally and reports the same code via onError.
    expect(() =>
      core.addTranslations({
        en: { cart: "{count, plural, one {# item} other {# items}}" },
      }),
    ).toThrow(expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }));
  });

  it("compiles ICU on the default branch when icu is true", async () => {
    const { createComviI18n, createComviCore } = await emitHostTemplate(undefined, { icu: true });

    // Counterpart to the detector test: proves `compiler: icuCompiler` is wired, not just emitted.
    const core = createComviCore({ locale: "en" });
    core.addTranslations({
      en: { cart: "{count, plural, one {# item} other {# items}}" },
    });
    expect(core.t("cart", { count: 5 })).toBe("5 items");
    expect(core.t("cart", { count: 1 })).toBe("1 item");

    // Same template function builds both, so SSR and client share one compiler.
    const i18n = createComviI18n({ locale: "en", exposeGlobal: false });
    i18n.core.addTranslations({
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
    expect(typeof core.reloadTranslations).toBe("function");
    expect(core.use).toBeUndefined();

    // …and every construction gets a FRESH host (one per request on the server).
    const i18n = createComviI18n({ locale: "en", ssrLocale: "de" });
    expect(built).toHaveLength(2);
    expect(i18n.core).toBe(built[1]);
    expect(i18n.core).not.toBe(core);

    // ssrLocale is nuxt's resolved render locale: the host follows it.
    expect(i18n.core.locale).toBe("de");
    expect(i18n.locale.value).toBe("de");

    // The capability proxies are absent from the wrapper on this branch too.
    expect("reloadTranslations" in i18n).toBe(false);
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

  it("throws a named error when the host factory returns no host", async () => {
    nuxtKitMocks.findPath.mockResolvedValue(writeHostModule("export default () => undefined;\n"));
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    // Regression: a factory missing its `return` used to fail deep inside createI18nFromCore.
    expect(() => createComviCore()).toThrow(
      "[@comvi/nuxt] comvi hostModule's default export returned no i18n host.",
    );
  });

  it("throws a named error when the host module's default export is not a function", async () => {
    // A missing default is an ESM link error; a WRONG default is the reachable shape.
    nuxtKitMocks.findPath.mockResolvedValue(writeHostModule("export default {};\n"));
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    expect(() => createComviCore()).toThrow(
      "[@comvi/nuxt] comvi hostModule must export a default function returning an i18n host.",
    );
  });
});
