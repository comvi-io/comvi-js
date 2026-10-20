import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The dist-level mangling canary.
 *
 * `core/loader.ts`, `core/plugins.ts` and `core/devtools.ts` reach into
 * base-class state through `_`-prefixed members that terser renames with ONE
 * shared nameCache across every chunk of the prod build. That contract can
 * only fail in the built artifacts, so a src-level vitest run is not
 * admissible proof: this suite composes and drives the MANGLED prod dist
 * directly, and asserts the mangler actually ran on it.
 *
 * Requires a fresh build.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

/** Cross-chunk internals whose names must never survive into the prod dist. */
const INTERNAL_NAMES = [
  // Owned by the base class, re-read after their own awaits by the loader and
  // plugin chunks — see `destroy-races.dist.test.ts`.
  "_isDestroyed",
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
  "_initDevtools",
  "_disposeDevtools",
  "_globalEntry",
  "_preflightSimpleCatalog",
  // Declared and applied by the base chunk (`core/i18n.ts`), seeded and taken
  // over by the plugin chunk (`core/plugins.ts`) on the first
  // `registerPostProcessor()`.
  "_postProcessor",
];

/** Dev-only text: absent from every prod artifact, readable verbatim in dev. */
const DEV_ONLY_STRINGS = [
  "comviShim",
  "compose capabilities before init()",
  "capabilityShim",
  // The editor loader's two warnings (`core/devtools.ts`).
  "will not load the editor",
  "editorVersion ignored",
] as const;

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

// The devtools discovery queue is a real `window` global under happy-dom.
const win: { __COMVI__?: unknown } = window;
const previousGlobal = win.__COMVI__;
afterEach(() => {
  if (previousGlobal === undefined) delete win.__COMVI__;
  else win.__COMVI__ = previousGlobal;
});

describe("prod dist: base + /loader + /plugins composition (A6)", () => {
  it("composes, loads, switches locale and reloads against the mangled build", async () => {
    // Dynamic on purpose: these are BUILD OUTPUTS, not source modules. A static
    // import is hoisted above `beforeAll`, so a missing or stale dist would fail
    // with an opaque resolution error instead of "run the build first".
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");

    const store: Record<string, Record<string, string>> = {
      "en:default": { hello: "Hello" },
      "fr:default": { hello: "Bonjour" },
    };

    const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(async (locale: string, ns: string) => store[`${locale}:${ns}`] ?? {});
    await i18n.init();

    expect(i18n.t("hello")).toBe("Hello");

    await i18n.setLocale("fr");
    expect(i18n.t("hello")).toBe("Bonjour");

    store["fr:default"] = { hello: "Salut" };
    await i18n.reloadMessages();
    expect(i18n.t("hello")).toBe("Salut");

    await i18n.destroy();
    expect(i18n.getLoader()).toBeUndefined();
  });

  it("resolves the relocated import-map adapter through the same subpath", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader, createImportMapLoader } = await import("../../dist/comvi-core-loader.js");

    const mapped = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
    mapped.registerLoader(
      createImportMapLoader({ en: async () => ({ default: { hello: "Hi" } }) }, () =>
        mapped.getDefaultNamespace(),
      ),
    );
    await mapped.init();

    expect(mapped.t("hello")).toBe("Hi");
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
          messages: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
          exposeGlobal: false,
        }),
      ),
    );

    i18n.registerPlugin((host: { registerLocaleDetector: (d: () => string) => void }) => {
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

  it("attaches discovery against the mangled build", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachDevtools } = await import("../../dist/comvi-core-devtools.js");

    // `_initDevtools` / `_disposeDevtools` / `_globalEntry` are mangled and
    // installed from a DIFFERENT chunk than the base class reads them from;
    // only the built artifacts can prove the nameCache agreed. The suite runs
    // on happy-dom, so `window` is real here.
    const i18n = attachDevtools(createI18n({ locale: "en", exposeGlobal: true }), {
      instanceId: "dist-probe",
    });

    expect(i18n.instanceId).toBe("dist-probe");
    const queue = win.__COMVI__;
    expect(Array.isArray(queue)).toBe(true);
    expect(queue).toHaveLength(1);
    expect((queue as Array<{ i: unknown }>)[0]!.i).toBe(i18n);

    await i18n.destroy();

    expect(queue).toHaveLength(0);
  });

  it("installs the editor loader with its public keys intact in the mangled build", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { devtools } = await import("../../dist/comvi-core-devtools.js");
    const slots = globalThis as unknown as Record<symbol, unknown>;
    const key = Symbol.for("comvi.devtools.editorLoader");
    delete slots[key];

    // The slot is a wire contract read by other programs: none of its keys
    // may be renamed by the property mangler, and the pin has to survive the
    // mangled `_initDevtools` call that carries it.
    createI18n({ locale: "en" }).use(devtools({ editorVersion: "0.5.3" }));
    const slot = slots[key] as Record<string, unknown>;
    delete slots[key];

    expect(Object.keys(slot).sort()).toEqual([
      "editorVersion",
      "load",
      "protocol",
      "sdkVersion",
      "url",
    ]);
    expect(slot.url).toBe(
      "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@0.5.3/dist/standalone.iife.js",
    );
  });

  it("an invalid editorVersion fails closed in the mangled build", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { devtools } = await import("../../dist/comvi-core-devtools.js");
    const slots = globalThis as unknown as Record<symbol, unknown>;
    const key = Symbol.for("comvi.devtools.editorLoader");
    delete slots[key];
    const before = document.querySelectorAll("script").length;

    createI18n({ locale: "en" }).use(devtools({ editorVersion: "next" }));
    const slot = slots[key] as { editorVersion: string; url: string; load(): Promise<unknown> };
    const result = await slot.load();
    delete slots[key];

    expect(slot.editorVersion).toBe("invalid");
    expect(slot.url).toBe("");
    expect(result).toMatchObject({ ok: false, code: "invalid-editor-version" });
    expect(document.querySelectorAll("script").length).toBe(before);
  });

  it("a BARE host flattens a nested catalog against the mangled build (C1)", async () => {
    const { createI18n, flattenCatalog } = await import("../../dist/comvi-core.js");

    const bare = createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { nav: { home: "Home" } } },
    });
    expect(bare.t("nav.home")).toBe("Home");

    bare.addMessages({ en: { menu: { about: "About" } } });
    expect(bare.t("menu.about")).toBe("About");

    // The root still publishes the flattener, and it agrees with ingestion.
    expect(flattenCatalog({ nav: { home: "Home" } })).toEqual({ "nav.home": "Home" });
  });

  it("the /loader subpath no longer publishes flattenCatalog", async () => {
    const loaderEntry = await import("../../dist/comvi-core-loader.js");

    expect(loaderEntry.flattenCatalog).toBeUndefined();
    expect(typeof loaderEntry.attachLoader).toBe("function");
  });

  it("a loader-attached host flattens identically — no seam left to lose", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");

    const loaded = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));

    loaded.addMessages({ en: { nav: { home: "Home" } } });

    expect(loaded.t("nav.home")).toBe("Home");
  });

  it("folds the late-compose warnings out of prod (B2)", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");
    const { attachPlugins } = await import("../../dist/comvi-core-plugins.js");

    // The late-compose guidance is DEV-ONLY: the prod build must fold every
    // warning, and its string, away — so a late compose is silent here even
    // though the same calls warn once each in dev.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { hello: "Hello" } },
    });
    await i18n.init();

    attachPlugins(i18n).registerPlugin(() => {});
    attachLoader(i18n);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("folds the loader capability shims out of prod (B4)", async () => {
    // The capability shims are DEV-ONLY. Production keeps the bare `TypeError`
    // — still loud, just without the guidance — because only a plugin author,
    // at development time, ever reads them.
    const { createI18n, hasLoaderApi } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");
    const { attachPlugins } = await import("../../dist/comvi-core-plugins.js");

    const pluginsOnly = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));

    expect(pluginsOnly.registerLoader).toBeUndefined();
    expect(() => pluginsOnly.registerLoader(async () => ({}))).toThrow(TypeError);

    // The one gate that MUST NOT differ between the builds: `hasLoaderApi` is
    // both a feature detect and an acquisition guard, so a plugins-only host has
    // to read as "no loader" in prod exactly as in dev — where the branded shims
    // exist and are rejected, and here there are none to reject.
    expect(hasLoaderApi(pluginsOnly)).toBe(false);
    expect(hasLoaderApi(attachLoader(createI18n({ locale: "en", exposeGlobal: false })))).toBe(
      true,
    );
  });

  it("leaves no dev-only B2/B4 text in the prod artifacts", () => {
    // Behavioural assertions can pass while the STRINGS still ship — a folded
    // branch terser kept costs bytes and no API-level test would ever see it.
    // Hence the text scan.
    const files = distFiles(false);
    expect(files.length).toBeGreaterThan(0);

    const leaked: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const needle of DEV_ONLY_STRINGS) {
        if (source.includes(needle)) leaked.push(`${path.basename(file)} → ${needle}`);
      }
    }
    expect(leaked).toEqual([]);

    // The same strings MUST be present in the dev build, or the scan above is
    // proving nothing.
    const dev = distFiles(true)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    for (const needle of DEV_ONLY_STRINGS) {
      expect(dev, `${needle} must be readable in the dev build`).toContain(needle);
    }
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

  it("emits no dangling pure annotations before return statements", () => {
    const files = distFiles(false);
    expect(files.length).toBeGreaterThan(0);

    const invalid: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      if (/\/\* @__PURE__ \*\/\s*return\b/.test(source)) invalid.push(path.basename(file));
    }
    expect(invalid).toEqual([]);
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
