/**
 * What an ICU catalog arriving over a LOADER actually does in development.
 *
 * The inline path and the loader path share one preflight
 * (`_preflightSimpleCatalog`) and therefore one thrown error, but they do NOT
 * share a user-visible failure mode, and the READMEs describe both in one
 * sentence — so the sentence needs the loader half pinned here.
 *
 * Inline (`new I18n({ messages })` / `addMessages`): the preflight
 * throws `E_ICU_SYNTAX` synchronously, at the call.
 *
 * Loader: the throw happens inside `_loadOne`, which emits `loadError` with it
 * and re-throws; `_loadNs` collects the per-namespace rejection and — when
 * EVERY namespace failed — reports and throws its own
 * "Failed to load all namespaces" error, which is what rejects `init()`.
 * `E_ICU_SYNTAX` itself reaches the `loadError` event and nothing else: it is
 * not what `init()` rejects with, and it never reaches `onError`.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import type { ErrorReportContext } from "../../src/types";

const ICU_CATALOG = { cart: "{count, plural, one {# item} other {# items}}" };

type Reported = { error: Error; context?: ErrorReportContext };

function hostWithIcuLoader(options?: { ns?: string[] }) {
  const reported: Reported[] = [];
  const i18n = attachLoader(
    createI18n({
      locale: "en",
      exposeGlobal: false,
      ns: options?.ns,
      onError: (error, context) => reported.push({ error: error as Error, context }),
    }),
  );
  const loadErrors: { locale: string; namespace: string; error: Error }[] = [];
  i18n.onLoadError((locale, namespace, error) => loadErrors.push({ locale, namespace, error }));

  const loaded: string[] = [];
  i18n.registerLoader(async (locale, namespace) => {
    loaded.push(`${locale}:${namespace}`);
    return namespace === "clean" ? { hello: "Hello" } : ICU_CATALOG;
  });

  return { i18n, reported, loadErrors, loaded };
}

describe("an ICU catalog over the loader, in development", () => {
  it("rejects init() with the all-namespaces-failed error, not with E_ICU_SYNTAX", async () => {
    const { i18n } = hostWithIcuLoader();

    await expect(i18n.init()).rejects.toThrow(
      '[@comvi/core] Failed to load all namespaces for locale "en": default',
    );
    await expect(i18n.init()).rejects.not.toHaveProperty("code");
  });

  it("leaves the host uninitialized, which is what keeps a provider on its fallback", async () => {
    const { i18n } = hostWithIcuLoader();

    await expect(i18n.init()).rejects.toThrow();

    expect(i18n.isInitialized).toBe(false);
    expect(i18n.isInitializing).toBe(false);
    expect(i18n.hasLocale("en", "default")).toBe(false);
    expect(i18n.t("cart" as never, { count: 2 } as never)).toBe("cart");
  });

  it("reports E_ICU_SYNTAX through loadError only, never through onError", async () => {
    const { i18n, reported, loadErrors } = hostWithIcuLoader();

    await expect(i18n.init()).rejects.toThrow();

    expect(loadErrors).toHaveLength(1);
    expect(loadErrors[0]!.locale).toBe("en");
    expect(loadErrors[0]!.namespace).toBe("default");
    expect(loadErrors[0]!.error).toMatchObject({
      code: "E_ICU_SYNTAX",
      argumentType: "plural",
    });
    expect(loadErrors[0]!.error.message).toContain('is ICU "plural" syntax');

    // onError saw the namespace-load failure and NOT the ICU error.
    expect(reported.map((r) => r.error.message)).toEqual([
      '[@comvi/core] Failed to load all namespaces for locale "en": default',
    ]);
    expect(reported[0]!.context).toMatchObject({
      source: "namespace-load",
      locale: "en",
      namespace: "default",
    });
  });

  it("resolves init() when only SOME namespaces carry ICU, reporting the partial failure", async () => {
    const { i18n, reported, loadErrors } = hostWithIcuLoader({ ns: ["clean", "icu"] });

    await expect(i18n.init()).resolves.toBe(i18n);

    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t("hello" as never, { ns: "clean" } as never)).toBe("Hello");

    expect(loadErrors.map((entry) => entry.namespace)).toEqual(["icu"]);
    expect(loadErrors[0]!.error).toMatchObject({ code: "E_ICU_SYNTAX" });
    expect(reported.map((r) => r.error.message)).toEqual([
      '[@comvi/core] Partial namespace load failure for "en": 1/2 failed (icu)',
    ]);
  });

  it("throws E_ICU_SYNTAX at the call on the INLINE path, for contrast", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    let thrown: unknown;
    try {
      i18n.addMessages({ en: ICU_CATALOG });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "E_ICU_SYNTAX", argumentType: "plural" });
  });

  it("does not reach the preflight at all when the ICU compiler is composed", async () => {
    const { icuCompiler } = await import("../../src/icu");
    const onError = vi.fn();
    const i18n = attachLoader(
      createI18n({ locale: "en", exposeGlobal: false, compiler: icuCompiler, onError }),
    );
    i18n.registerLoader(async () => ICU_CATALOG);

    await expect(i18n.init()).resolves.toBe(i18n);
    expect(i18n.t("cart" as never, { count: 2 } as never)).toBe("2 items");
    expect(onError).not.toHaveBeenCalled();
  });
});
