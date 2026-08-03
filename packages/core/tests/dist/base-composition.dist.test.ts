import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Acceptance A6 — the dist-level mangling canary.
 *
 * `core/loader.ts`, `core/plugins.ts` and `core/devtools.ts` reach into
 * base-class state through `_`-prefixed members that terser renames with ONE
 * shared nameCache across every chunk of the prod build. That contract can
 * only fail in the built artifacts, so a src-level vitest run is not
 * admissible proof: this suite composes and drives the MANGLED prod dist
 * directly, and asserts the mangler actually ran on it.
 *
 * Requires a fresh build — CI runs `pnpm --filter @comvi/core build` first.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

/** Cross-chunk internals whose names must never survive into the prod dist. */
const INTERNAL_NAMES = [
  "_pendingLoads",
  "_nsGeneration",
  "_loadNs",
  "_cancelNs",
  "_preDestroy",
  "_resetLoader",
  "_initLoader",
  "_beforeInit",
  "_missHook",
  "_resetPlugins",
  "_initPlugins",
  // framework-slim tier-3 seams
  "_flattenNs",
  "_initDevtools",
  "_disposeDevtools",
  "_globalEntry",
  // single-entry convergence seams: `/icu`'s installer reaches
  // `_setCompilerBeforeIngestion` by dot access ACROSS a chunk boundary, so
  // these are live nameCache canaries too.
  "_setCompilerBeforeIngestion",
  "_compilerLocked",
  "_preflightSimpleCatalog",
];

function distFiles(dev: boolean): string[] {
  const roots = [DIST, path.join(DIST, "chunks")];
  const out: string[] = [];
  for (const root of roots) {
    for (const name of fs.readdirSync(root)) {
      if (!name.endsWith(".js")) continue;
      if (!name.startsWith("comvi-core")) continue;
      if (name.includes(".global.")) continue;
      if (name.endsWith(".dev.js") !== dev) continue;
      out.push(path.join(root, name));
    }
  }
  return out;
}

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core-plugins.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("prod dist: base + /loader + /plugins composition (A6)", () => {
  it("composes, loads, switches locale and reloads against the mangled build", async () => {
    // Dynamic on purpose: these are BUILD OUTPUTS, not source modules. A
    // static import is hoisted above `beforeAll`, so a missing/stale dist
    // would fail with an opaque resolution error instead of the actionable
    // "run the build first" message.
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader, createImportMapLoader } = await import("../../dist/comvi-core-loader.js");

    const store: Record<string, Record<string, string>> = {
      "en:default": { hello: "Hello" },
      "fr:default": { hello: "Bonjour" },
    };

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(async (locale: string, ns: string) => store[`${locale}:${ns}`] ?? {});
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");

    await i18n.setLocaleAsync("fr");
    expect(i18n.t("hello")).toBe("Bonjour");

    store["fr:default"] = { hello: "Salut" };
    await i18n.reloadTranslations();
    expect(i18n.t("hello")).toBe("Salut");

    // The relocated import-map adapter resolves through the same subpath.
    const mapped = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    mapped.registerLoader(
      createImportMapLoader(
        { en: async () => ({ default: { hello: "Hi" } }) },
        () => mapped.getDefaultNamespace(),
      ),
    );
    await mapped.init();
    expect(mapped.t("hello")).toBe("Hi");

    await i18n.destroy();
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("hosts plugins, detectors and missing-key callbacks against the mangled build", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");
    const { attachPlugins } = await import("../../dist/comvi-core-plugins.js");

    const order: string[] = [];
    const i18n = attachPlugins(
      attachLoader(
        createI18n({
          locale: "en",
          translation: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
          exposeGlobal: false,
        }),
      ),
    );

    i18n.use((host: { registerLocaleDetector: (d: () => string) => void }) => {
      order.push("plugin");
      host.registerLocaleDetector(() => "fr");
      return () => void order.push("cleanup");
    });
    i18n.setPluginData("probe", "set");
    i18n.onMissingKey(() => "from-callback");
    i18n.registerPostProcessor((r: string) => `${r}!`);

    await i18n.init();

    expect(order).toEqual(["plugin"]);
    expect(i18n.locale).toBe("fr");
    expect(i18n.t("hello")).toBe("Bonjour!");
    expect(i18n.t("absent")).toBe("from-callback!");
    expect(i18n.getPluginData("probe")).toBe("set");

    await i18n.destroy();
    expect(order).toEqual(["plugin", "cleanup"]);
    expect(i18n.getPluginData("probe")).toBeUndefined();
    expect(i18n.getLanguageDetector()).toBeUndefined();
  });

  it("attaches discovery and flattens nested catalogs against the mangled build", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachDevtools } = await import("../../dist/comvi-core-devtools.js");
    const { attachLoader, flattenCatalog } = await import("../../dist/comvi-core-loader.js");

    // `_initDevtools` / `_disposeDevtools` / `_globalEntry` are mangled and
    // installed from a DIFFERENT chunk than the base class reads them from;
    // only the built artifacts can prove the nameCache agreed. The suite runs
    // on happy-dom, so `window` is real here.
    const win: { __COMVI__?: unknown } = window;
    delete win.__COMVI__;
    try {
      const i18n = attachDevtools(createI18n({ locale: "en" }), { instanceId: "dist-probe" });
      expect(i18n.instanceId).toBe("dist-probe");

      const queue = win.__COMVI__;
      expect(Array.isArray(queue)).toBe(true);
      expect(queue).toHaveLength(1);
      expect((queue as Array<{ i: unknown }>)[0]!.i).toBe(i18n);

      await i18n.destroy();
      expect(queue).toHaveLength(0);
    } finally {
      delete win.__COMVI__;
    }

    // `_flattenNs` is a prototype member of the loader chunk consumed by the
    // base class's `_nsAddTranslations` — the same cross-chunk contract.
    const bare = createI18n({ locale: "en", exposeGlobal: false });
    bare.addTranslations({ en: { nav: { home: "Home" } } });
    expect(bare.t("nav.home")).toBe("nav.home");
    bare.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) });
    expect(bare.t("nav.home")).toBe("Home");

    const loaded = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    loaded.addTranslations({ en: { nav: { home: "Home" } } });
    expect(loaded.t("nav.home")).toBe("Home");
  });

  it("mangles every cross-chunk internal in the prod artifacts", () => {
    const files = distFiles(false);
    expect(files.length).toBeGreaterThan(0);

    const leaked: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const name of INTERNAL_NAMES) {
        if (source.includes(name)) leaked.push(`${path.basename(file)} → ${name}`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it("leaves the dev artifacts unmangled (proves the prod scan is meaningful)", () => {
    const files = distFiles(true);
    expect(files.length).toBeGreaterThan(0);

    const combined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    for (const name of INTERNAL_NAMES) {
      expect(combined, `${name} must be readable in the dev build`).toContain(name);
    }
  });
});
