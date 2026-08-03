import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Compiler Policy A, proved on the BUILT artifacts (plan §2.1/§2.1a/§2.1b).
 *
 * Three claims can only be checked here, never at src level:
 *
 *  1. **dev/prod topology.** Development throws EAGERLY at ingestion, because
 *     `_preflightSimpleCatalog` walks the catalog behind an `IS_DEV` gate.
 *     Production keeps that hook out of the bundle entirely and stays LAZY:
 *     the same catalog ingests, and the throw arrives on the first compile.
 *     Both are loud; neither is silent.
 *  2. **0 B in production.** The preflight identifier does not occur in any
 *     prod artifact — the `__DEV__` fold removed it, not the mangler.
 *  3. **cross-chunk mangling.** `icu()` lives in `comvi-core-icu.js` and
 *     reaches `_setCompilerBeforeIngestion` on a host built by
 *     `comvi-core.js` — a mangled `_`-internal dot access across a chunk
 *     boundary, which only the shared-nameCache prod build can satisfy.
 *
 * Requires a fresh build — CI runs `pnpm --filter @comvi/core build` first.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const PLURAL = "{count, plural, one {# item} other {# items}}";

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("prod dist: the loud ICU detector (Policy A)", () => {
  it("stays LAZY: the catalog ingests, the first render throws E_ICU_SYNTAX", async () => {
    // Dynamic on purpose (same reason as `base-composition.dist.test.ts`):
    // these are BUILD OUTPUTS, not source modules. A static import is hoisted
    // above `beforeAll`, so a missing or stale dist would fail with an opaque
    // resolution error instead of the actionable "run the build first".
    const { createI18n } = await import("../../dist/comvi-core.js");

    // Production has no eager preflight, so construction succeeds…
    const i18n = createI18n({ locale: "en", translation: { en: { items: PLURAL } } });

    // …and the compile miss throws, with the bounded production message.
    let thrown: unknown;
    try {
      i18n.t("items", { count: 2 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((thrown as { argumentType?: unknown }).argumentType).toBe("plural");
    expect((thrown as Error).message).toBe("E_ICU_SYNTAX");

    // The throw prevented cache insertion, so nothing is ever silently served:
    // every later call re-parses and re-throws.
    expect(() => i18n.t("items", { count: 3 })).toThrow();
  });

  it("owns exactly `code` and `argumentType` — telemetry context is the app's", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const i18n = createI18n({ locale: "en", translation: { en: { g: "{g, select, other{x}}" } } });

    let thrown: unknown;
    try {
      i18n.t("g", { g: "a" });
    } catch (error) {
      thrown = error;
    }
    // Everything a plain `new Error(msg)` already owns is baseline; what the
    // detector ADDS must be exactly the two contract fields. No locale, no
    // namespace, no key, no catalog source: §2.1a makes those
    // application-supplied telemetry, deliberately not core-error fields.
    const baseline = new Set(Object.getOwnPropertyNames(new Error("x")));
    const added = Object.getOwnPropertyNames(thrown as object)
      .filter((name) => !baseline.has(name))
      .sort();
    expect(added).toEqual(["argumentType", "code"]);
    expect((thrown as { argumentType?: unknown }).argumentType).toBe("select");
  });

  it("reports the truthful parsed token for argument types it does not ship", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const i18n = createI18n({
      locale: "en",
      translation: { en: { n: "{v, number}", d: "{d, date, short}", o: "{name, other}" } },
    });

    for (const [key, argumentType] of [
      ["n", "number"],
      ["d", "date"],
      ["o", "other"],
    ] as const) {
      let thrown: unknown;
      try {
        i18n.t(key, { v: 1, d: 1, name: "x" });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { argumentType?: unknown }).argumentType).toBe(argumentType);
    }
  });

  it("leaves quoted literals and plain interpolation alone", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const i18n = createI18n({
      locale: "en",
      translation: { en: { quoted: "'{name, other}'", plain: "Hello, {name}!" } },
    });

    expect(i18n.t("quoted")).toBe("{name, other}");
    expect(i18n.t("plain", { name: "Ada" })).toBe("Hello, Ada!");
  });

  it("is bypassed by the ICU compiler, from the option and from the installer", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { icu, icuCompiler } = await import("../../dist/comvi-core-icu.js");

    const viaOption = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: PLURAL } },
    });
    expect(viaOption.t("items", { count: 2 })).toBe("2 items");

    // The installer reaches the MANGLED `_setCompilerBeforeIngestion` across a
    // chunk boundary — this call is the nameCache canary.
    const viaInstaller = createI18n({ locale: "en" }).with(icu());
    viaInstaller.addTranslations({ en: { items: PLURAL } });
    expect(viaInstaller.t("items", { count: 1 })).toBe("1 item");
  });

  it("keeps the LOADER path lazy: the merge succeeds, the first render throws", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");

    const i18n = attachLoader(createI18n({ locale: "en" }));
    i18n.registerLoader(async () => ({ items: PLURAL }));

    // No eager walk in production, so the catalog merges…
    await i18n.init();
    expect(i18n.t("greeting", { fallback: "ok" })).toBe("ok");

    // …and the throw arrives at the first compile of that template.
    let thrown: unknown;
    try {
      i18n.t("items", { count: 2 });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((thrown as Error).message).toBe("E_ICU_SYNTAX");
  });

  it("locks the compiler at ingestion and throws E_COMPILER_LOCKED afterwards", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { icu } = await import("../../dist/comvi-core-icu.js");

    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });

    let thrown: unknown;
    try {
      i18n.with(icu());
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown }).code).toBe("E_COMPILER_LOCKED");
    expect((thrown as Error).message).toBe("E_COMPILER_LOCKED");
  });
});

describe("dev dist: the eager preflight (§2.1a)", () => {
  it("throws EAGERLY at construction, before any render", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");

    let thrown: unknown;
    try {
      createI18n({ locale: "en", translation: { en: { items: PLURAL } } });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((thrown as { argumentType?: unknown }).argumentType).toBe("plural");
    // Dev carries the actionable prose the production message drops.
    expect((thrown as Error).message).toContain("@comvi/core/icu");
  });

  it("throws EAGERLY from addTranslations too, and the host stays locked", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");
    const { icu } = await import("../../dist/comvi-core-icu.dev.js");

    const i18n = createI18n({ locale: "en" });
    expect(() => i18n.addTranslations({ en: { items: PLURAL } })).toThrow(/E_ICU_SYNTAX|ICU/);

    let thrown: unknown;
    try {
      i18n.with(icu());
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown }).code).toBe("E_COMPILER_LOCKED");
  });

  it("throws EAGERLY from the LOADER's direct merge, before the cache write", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.dev.js");
    const { icu } = await import("../../dist/comvi-core-icu.dev.js");

    const i18n = attachLoader(createI18n({ locale: "en" }));
    i18n.registerLoader(async () => ({ items: PLURAL }));

    // Ingestion seam 2: the preflight runs on the loaded catalog BEFORE
    // `translationCache.set`. The loader reports a failed namespace through
    // `loadError` rather than rejecting `init()` — that is the shipped loader
    // contract for ANY loader failure — so the error is observed there.
    const errors: Array<{ code?: unknown; argumentType?: unknown }> = [];
    i18n.on("loadError", (data: { error: Error }) => void errors.push(data.error));

    // `init()` surfaces the namespace failure (the shipped loader contract);
    // the STRUCTURED cause is on the `loadError` payload.
    await expect(i18n.init()).rejects.toThrow(/Failed to load all namespaces/);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("E_ICU_SYNTAX");
    expect(errors[0]!.argumentType).toBe("plural");

    // Nothing was merged: the key is still missing, which is what "before the
    // cache merge" means observably — no template that can only throw later
    // ever entered the cache.
    expect(i18n.t("items", { count: 2 })).toBe("items");
    expect(i18n.hasTranslation("items")).toBe(false);

    // And the seam locked the compiler on its way through, so a late installer
    // cannot paper over the catalog that was rejected.
    let locked: unknown;
    try {
      i18n.with(icu());
    } catch (error) {
      locked = error;
    }
    expect((locked as { code?: unknown }).code).toBe("E_COMPILER_LOCKED");
  });

  it("stays silent when the effective compiler is not the simple one", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");
    const { icuCompiler } = await import("../../dist/comvi-core-icu.dev.js");

    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: PLURAL } },
    });
    expect(i18n.t("items", { count: 5 })).toBe("5 items");
  });
});

describe("the preflight costs the production bundle 0 B", () => {
  /** Every prod core artifact, entries and chunks alike. */
  function prodFiles(): string[] {
    const out: string[] = [];
    for (const root of [DIST, path.join(DIST, "chunks")]) {
      for (const name of fs.readdirSync(root)) {
        if (!name.startsWith("comvi-core") || !name.endsWith(".js")) continue;
        if (name.endsWith(".dev.js") || name.includes(".global.")) continue;
        out.push(path.join(root, name));
      }
    }
    return out;
  }

  it("emits no preflight call site into any prod artifact", () => {
    const files = prodFiles();
    expect(files.length).toBeGreaterThan(0);

    // The hook is installed inside an `if (IS_DEV)` block and called through
    // `?.()` behind the same gate, so the __DEV__ fold removes the whole
    // thing. Nothing to mangle means nothing to pay for.
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.basename(file)} must not carry the preflight`).not.toContain(
        "_preflightSimpleCatalog",
      );
      expect(source, `${path.basename(file)} must not carry the dev guidance`).not.toContain(
        "is not a shipped ICU argument type",
      );
      // The §2.3 ambient-tag warning is the same deal: development-only, so
      // neither its guidance nor its once-per-template bookkeeping may ship.
      expect(source, `${path.basename(file)} must not carry the tag guidance`).not.toContain(
        "rendering as literal text",
      );
    }
  });

  it("keeps the preflight readable in the dev artifacts (proves the scan is meaningful)", () => {
    const dev = fs.readFileSync(path.join(DIST, "comvi-core.dev.js"), "utf8");
    const devChunks = fs
      .readdirSync(path.join(DIST, "chunks"))
      .filter((name) => name.endsWith(".dev.js"))
      .map((name) => fs.readFileSync(path.join(DIST, "chunks", name), "utf8"))
      .join("\n");

    expect(`${dev}\n${devChunks}`).toContain("_preflightSimpleCatalog");
    expect(`${dev}\n${devChunks}`).toContain("rendering as literal text");
  });
});
