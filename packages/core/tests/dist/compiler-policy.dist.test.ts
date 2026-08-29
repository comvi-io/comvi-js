import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The compiler policy, proved on the BUILT artifacts. Three claims can only be
 * checked here, never at src level:
 *
 *  1. **dev/prod topology.** Development throws EAGERLY at ingestion; production
 *     keeps the preflight hook out of the bundle and stays LAZY, rendering the
 *     braced segment literally and reporting `E_ICU_SYNTAX` on the compile.
 *  2. **0 B in production.** The preflight identifier occurs in no prod
 *     artifact — the `__DEV__` fold removed it, not the mangler.
 *  3. **cross-chunk mangling.** `icu()` lives in `comvi-core-icu.js` and reaches
 *     `_setCompilerBeforeIngestion` on a host built by `comvi-core.js`: a
 *     mangled `_`-internal dot access across a chunk boundary, which only the
 *     shared-nameCache prod build can satisfy.
 *
 * THE TEMPLATE CACHE is module-global to the imported dist module, so every
 * case below uses a DISTINCT template string — two cases sharing one would make
 * the second a cache hit that reports nothing.
 *
 * Requires a fresh build.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const PLURAL = "{count, plural, one {# item} other {# items}}";

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("prod dist: the ICU literal + best-effort report (D1)", () => {
  it("renders the ICU segment LITERALLY and reports E_ICU_SYNTAX on the compile", async () => {
    // Dynamic on purpose (same reason as `base-composition.dist.test.ts`):
    // these are BUILD OUTPUTS, not source modules. A static import is hoisted
    // above `beforeAll`, so a missing or stale dist would fail with an opaque
    // resolution error instead of the actionable "run the build first".
    const { createI18n } = await import("../../dist/comvi-core.js");

    const reports: Array<{ error: Error; context?: Record<string, unknown> }> = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { items: PLURAL } },
      onError: (error: Error, context?: Record<string, unknown>) =>
        void reports.push({ error, context }),
    });

    // Verbatim, character for character: one raw text token, never a
    // plausibly-wrong rendering.
    expect(i18n.t("items", { count: 2 })).toBe(PLURAL);

    expect(reports).toHaveLength(1);
    const { error, context } = reports[0]!;
    expect((error as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((error as { argumentType?: unknown }).argumentType).toBe("plural");
    expect(error.message).toBe("E_ICU_SYNTAX");
    expect(context).toEqual({
      source: "compile",
      key: "items",
      namespace: "default",
      locale: "en",
    });
  });

  it("reports on the COMPILATION, never on a cached render", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const template = "{n, plural, one {# cached} other {# cacheds}}";

    const reports: unknown[] = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { cached: template } },
      onError: (error: Error) => void reports.push(error),
    });

    expect(i18n.t("cached", { n: 1 })).toBe(template);
    expect(reports).toHaveLength(1);

    // The parse is cached, so there is no compilation left to report on.
    expect(i18n.t("cached", { n: 5 })).toBe(template);
    expect(reports).toHaveLength(1);
  });

  it("falls back to console.error exactly once when no onError is configured", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const template = "{n, plural, one {# console} other {# consoles}}";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const i18n = createI18n({ locale: "en", translation: { en: { c: template } } });
    expect(i18n.t("c", { n: 2 })).toBe(template);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[comvi] E_ICU_SYNTAX", "c", "en");

    expect(i18n.t("c", { n: 3 })).toBe(template);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports the FALLBACK locale when the template only exists there", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const template = "{n, plural, one {# fallback} other {# fallbacks}}";

    const contexts: Array<Record<string, unknown> | undefined> = [];
    const i18n = createI18n({
      locale: "fr",
      fallbackLocale: "en",
      translation: { en: { fb: template } },
      onError: (_error: Error, context?: Record<string, unknown>) => void contexts.push(context),
    });

    expect(i18n.t("fb", { n: 2 })).toBe(template);
    expect(contexts).toHaveLength(1);
    // The locale that actually COMPILED, not the requested one.
    expect(contexts[0]).toEqual({
      source: "compile",
      key: "fb",
      namespace: "default",
      locale: "en",
    });
  });

  it("covers a per-call `params.fallback`, which never passed through ingestion", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const template = "{n, plural, one {# fb} other {# fbs}}";

    const reports: Array<{ error: Error; context?: Record<string, unknown> }> = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { plainKey: "Hi, {name}!" } },
      onError: (error: Error, context?: Record<string, unknown>) =>
        void reports.push({ error, context }),
    });

    // `params.fallback` is a TEMPLATE compiled by the missing-key path, so it is
    // a compile site like any other — and the key reported is the one the CALLER
    // asked for, not the fallback's text.
    expect(i18n.t("missing", { n: 2, fallback: template })).toBe(template);
    expect(reports).toHaveLength(1);
    expect((reports[0]!.error as { argumentType?: unknown }).argumentType).toBe("plural");
    expect(reports[0]!.context).toEqual({
      source: "compile",
      key: "missing",
      namespace: "default",
      locale: "en",
    });
  });

  it("does not leak a `params.fallback` compile hit into the next translation", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    // Distinct from the template above: the compile report fires once per
    // template across the module-level cache, so a shared one reports nothing.
    const template = "{n, plural, one {# leak} other {# leaks}}";

    const reports: unknown[] = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { plainKey: "Hi, {name}!" } },
      onError: (error: Error) => void reports.push(error),
    });

    expect(i18n.t("missing", { n: 2, fallback: template })).toBe(template);

    // Before the fix the hit survived into the next, unrelated translation and
    // was reported against key "plainKey".
    expect(i18n.t("plainKey", { name: "Ada" })).toBe("Hi, Ada!");

    expect(reports).toHaveLength(1);
  });

  it("never leaks a pending hit across instances", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const template = "{n, plural, one {# cross} other {# crosses}}";

    const aReports: unknown[] = [];
    const bReports: unknown[] = [];
    const a = createI18n({
      locale: "en",
      translation: { en: {} },
      onError: (error: Error) => void aReports.push(error),
    });
    const b = createI18n({
      locale: "en",
      translation: { en: { plain: "Just text" } },
      onError: (error: Error) => void bReports.push(error),
    });

    // The `params.fallback` compile is the path whose hit used to reach nobody,
    // and so the one that used to cross the instance boundary.
    expect(a.t("hit", { n: 3, fallback: template })).toBe(template);

    // The leak claim, asserted FIRST so it is what fails: same tick, other
    // instance, unrelated plain key. Before the fix B reported `E_ICU_SYNTAX`
    // against "plain".
    expect(b.t("plain")).toBe("Just text");
    expect(bReports).toHaveLength(0);

    // …and the hit was not simply dropped: A owns it.
    expect(aReports).toHaveLength(1);
  });

  it("owns exactly `code` and `argumentType` — telemetry context is the app's", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const reported: Error[] = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { g: "{g, select, other{x}}" } },
      onError: (error: Error) => void reported.push(error),
    });

    expect(i18n.t("g", { g: "a" })).toBe("{g, select, other{x}}");
    // What the detector ADDS over a plain `new Error(msg)` must be exactly the
    // two contract fields. Locale, namespace, key and catalog source are
    // application-supplied telemetry, deliberately NOT core-error fields.
    const baseline = new Set(Object.getOwnPropertyNames(new Error("x")));
    const added = Object.getOwnPropertyNames(reported[0]!)
      .filter((name) => !baseline.has(name))
      .sort();
    expect(added).toEqual(["argumentType", "code"]);
    expect((reported[0] as { argumentType?: unknown }).argumentType).toBe("select");
  });

  it.each([
    ["number", "n", "{v, number}"],
    ["date", "d", "{d, date, short}"],
    ["other", "o", "{name, other}"],
  ])(
    "reports the truthful parsed token for the unshipped argument type %s",
    async (argumentType, key, template) => {
      const { createI18n } = await import("../../dist/comvi-core.js");
      const reported: Array<{ argumentType?: unknown }> = [];
      const i18n = createI18n({
        locale: "en",
        translation: { en: { [key]: template } },
        onError: (error: Error) => void reported.push(error),
      });

      expect(i18n.t(key, { v: 1, d: 1, name: "x" })).toBe(template);

      expect(reported[0]?.argumentType).toBe(argumentType);
    },
  );

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

    // This call is the nameCache canary: it reaches the MANGLED
    // `_setCompilerBeforeIngestion` across a chunk boundary.
    const viaInstaller = createI18n({ locale: "en" }).with(icu());
    viaInstaller.addTranslations({ en: { items: PLURAL } });
    expect(viaInstaller.t("items", { count: 1 })).toBe("1 item");
  });

  it("keeps the LOADER path lazy: the merge succeeds, the first render reports", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.js");
    const template = "{count, plural, one {# loaded} other {# loadeds}}";

    const reports: Array<{ code?: unknown }> = [];
    const i18n = attachLoader(
      createI18n({ locale: "en", onError: (error: Error) => void reports.push(error) }),
    );
    i18n.registerLoader(async () => ({ items: template }));

    await i18n.init();
    expect(i18n.t("greeting", { fallback: "ok" })).toBe("ok");

    expect(i18n.t("items", { count: 2 })).toBe(template);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.code).toBe("E_ICU_SYNTAX");
  });

  it("locks the compiler at ingestion and throws E_COMPILER_LOCKED afterwards", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    const { icu } = await import("../../dist/comvi-core-icu.js");

    const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });

    expect(() => i18n.with(icu())).toThrowError(
      expect.objectContaining({ code: "E_COMPILER_LOCKED", message: "E_COMPILER_LOCKED" }),
    );
  });
});

describe("dev dist: the eager preflight (§2.1a)", () => {
  it("throws EAGERLY at construction, before any render", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");

    expect(() => createI18n({ locale: "en", translation: { en: { items: PLURAL } } })).toThrowError(
      expect.objectContaining({
        code: "E_ICU_SYNTAX",
        argumentType: "plural",
        message: expect.stringContaining("@comvi/core/icu"),
      }),
    );
  });

  it("throws EAGERLY from addTranslations too, and the host stays locked", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");
    const { icu } = await import("../../dist/comvi-core-icu.dev.js");

    const i18n = createI18n({ locale: "en" });
    expect(() => i18n.addTranslations({ en: { items: PLURAL } })).toThrow(/E_ICU_SYNTAX|ICU/);

    expect(() => i18n.with(icu())).toThrowError(
      expect.objectContaining({ code: "E_COMPILER_LOCKED" }),
    );
  });

  it("throws EAGERLY from the LOADER's direct merge, before the cache write", async () => {
    const { createI18n } = await import("../../dist/comvi-core.dev.js");
    const { attachLoader } = await import("../../dist/comvi-core-loader.dev.js");
    const { icu } = await import("../../dist/comvi-core-icu.dev.js");

    const i18n = attachLoader(createI18n({ locale: "en" }));
    i18n.registerLoader(async () => ({ items: PLURAL }));

    // The preflight runs on the loaded catalog BEFORE `translationCache.set`.
    // A failed namespace surfaces through `loadError` rather than rejecting
    // `init()` — the shipped contract for ANY loader failure.
    const errors: Array<{ code?: unknown; argumentType?: unknown }> = [];
    i18n.on("loadError", (data: { error: Error }) => void errors.push(data.error));

    await expect(i18n.init()).rejects.toThrow(/Failed to load all namespaces/);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("E_ICU_SYNTAX");
    expect(errors[0]!.argumentType).toBe("plural");

    // "Before the cache merge", observably: no template that can only throw
    // later ever entered the cache.
    expect(i18n.t("items", { count: 2 })).toBe("items");
    expect(i18n.hasTranslation("items")).toBe(false);

    // The seam locked the compiler on its way through, so a late installer
    // cannot paper over the rejected catalog.
    expect(() => i18n.with(icu())).toThrowError(
      expect.objectContaining({ code: "E_COMPILER_LOCKED" }),
    );
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

    // Installed inside an `if (IS_DEV)` block and called through `?.()` behind
    // the same gate, so the __DEV__ fold removes the whole thing.
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.basename(file)} must not carry the preflight`).not.toContain(
        "_preflightSimpleCatalog",
      );
      expect(source, `${path.basename(file)} must not carry the dev guidance`).not.toContain(
        "is not a shipped ICU argument type",
      );
      // The ambient-tag warning is the same deal: development-only, so neither
      // its guidance nor its once-per-template bookkeeping may ship.
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
