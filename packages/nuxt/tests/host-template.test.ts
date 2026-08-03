// The `#build/comvi.host` template is generated TEXT, so module.test.ts can
// only assert what it says. This file executes it: both branches are written
// to disk and imported, which is the only way to prove the emitted code parses,
// resolves, and wires the host the way the option promises (framework-slim P4
// step 5).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

interface HostTemplate {
  createComviI18n: (options: Record<string, unknown>) => {
    core: Record<string, unknown> & { locale: string };
    locale: { value: string };
  };
  createComviCore: (
    options?: Record<string, unknown>,
  ) => Record<string, unknown> & { locale: string };
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
async function emitHostTemplate(hostModule?: string): Promise<HostTemplate> {
  vi.resetModules();
  // Dynamic on purpose: the module has to be re-evaluated per case so its
  // @nuxt/kit calls land in a freshly reset mock.
  const imported = await import("../src/module");
  // `defineNuxtModule` is mocked to the identity, so the default export is the
  // definition object itself — a shape @nuxt/schema's NuxtModule type hides.
  const moduleDefinition = imported.default as unknown as ModuleDefinition;

  await moduleDefinition.setup(
    { locales: ["en"], defaultLocale: "en", ...(hostModule ? { hostModule } : {}) },
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

describe("generated #build/comvi.host template", () => {
  beforeEach(() => {
    nuxtKitMocks.addTemplate.mockReset();
    nuxtKitMocks.findPath.mockReset();
    nuxtKitMocks.findPath.mockResolvedValue(null);
  });

  it("builds a full-capability root instance on the default branch", async () => {
    const { createComviI18n, createComviCore } = await emitHostTemplate();

    const i18n = createComviI18n({ locale: "en", exposeGlobal: false });
    expect(i18n.locale.value).toBe("en");
    // Default branch: the emitted template builds vue's own `createI18n` on
    // core's ROOT entry, which since the single-entry convergence is the BASE
    // host — no loader, no plugin host. The expectations below, and the
    // `reloadTranslations` one further down, still encode the 0.4 capability
    // surface, so they FAIL on this tree: a real break for the nuxt phase to
    // resolve — compose the capabilities in the template, or retarget the
    // assertion — not something a comment can repair.
    expect(typeof i18n.core.registerLoader).toBe("function");
    expect(typeof i18n.core.use).toBe("function");

    const core = createComviCore({ locale: "de", exposeGlobal: false });
    expect(core.locale).toBe("de");
    expect(typeof core.reloadTranslations).toBe("function");
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
    // …and it is a composed slim host: loader yes, plugin host no.
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

    // The dropped proxies are gone from the wrapper on this branch too.
    expect("reloadTranslations" in i18n).toBe(false);
  });

  it("throws a named error when the host module's default export is not a function", async () => {
    // A missing default is an ESM link error before any of our code runs; a
    // WRONG default (an object, a re-exported instance) is the reachable shape.
    nuxtKitMocks.findPath.mockResolvedValue(writeHostModule("export default {};\n"));
    const { createComviCore } = await emitHostTemplate("./comvi.host.mjs");

    expect(() => createComviCore()).toThrow(
      "[@comvi/nuxt] comvi hostModule must export a default function returning an i18n host.",
    );
  });
});
