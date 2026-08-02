import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Acceptance A6 — the dist-level mangling canary.
 *
 * `core/loader.ts` (and, from S3, `core/plugins.ts`) reach into base-class
 * state through `_`-prefixed members that terser renames with ONE shared
 * nameCache across every chunk of the prod build. That contract can only fail
 * in the built artifacts, so a src-level vitest run is not admissible proof:
 * this suite composes and drives the MANGLED prod dist directly, and asserts
 * the mangler actually ran on it.
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
  if (!fs.existsSync(path.join(DIST, "comvi-core-loader.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("prod dist: slim + /loader composition (A6)", () => {
  it("composes, loads, switches locale and reloads against the mangled build", async () => {
    // Dynamic on purpose: these are BUILD OUTPUTS, not source modules. A
    // static import is hoisted above `beforeAll`, so a missing/stale dist
    // would fail with an opaque resolution error instead of the actionable
    // "run the build first" message.
    const { createI18n } = await import("../../dist/comvi-core-slim.js");
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
