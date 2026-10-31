/**
 * setLocale(), the fallback chain and the loads around them.
 * Ported by meaning from 0.7: locale-race, set-locale-cache-hit, loader-fallback-chain,
 * loader-locale-switch-arbitration, init-failure-rollback (→ partial failure, R4-11),
 * fallback-locale-ownership, languages (instance half).
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { state } from "../../src/internal";
import { flush, make, manualLoader, tableLoader, trace } from "./helpers";

const TABLE = {
  "en:default": { a: "A-en", b: "B-en", c: "C-en" },
  "de:default": { a: "A-de", b: "B-de" },
  "de-AT:default": { a: "A-at" },
  "fr:default": { a: "A-fr" },
  "uk:default": { a: "A-uk" },
  "en:extra": { x: "X-en" },
  "de:extra": {},
};

describe("setLocale() without a loader", () => {
  it("switches inside the call and publishes once", async () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" }, uk: { a: "А" } } });
    const seen = trace(i18n);
    const p = i18n.setLocale("uk");
    expect(i18n.locale).toBe("uk");
    expect(i18n.t("a")).toBe("А");
    expect(seen).toEqual(["uk#1"]);
    await expect(p).resolves.toBeUndefined();
  });

  it("to the current locale: nothing is published", async () => {
    const { i18n } = make({ locale: "en" });
    const seen = trace(i18n);
    await i18n.setLocale("en");
    expect(seen).toEqual([]);
    expect(i18n.rev()).toBe(0);
  });

  it("applies rapid switches in call order", async () => {
    const { i18n } = make({ locale: "en" });
    void i18n.setLocale("de");
    void i18n.setLocale("fr");
    expect(i18n.locale).toBe("fr");
  });

  it("re-entrant: a subscriber's switch lands, and every subscriber ends on the final locale", async () => {
    const { i18n } = make({ locale: "en", messages: { uk: { a: "uk" }, de: { a: "de" } } });
    i18n.on(() => {
      if (i18n.locale === "uk") void i18n.setLocale("de");
    });
    const seen = trace(i18n);
    await i18n.setLocale("uk");
    expect(i18n.locale).toBe("de");
    // No order of notifications is promised: a later subscriber may read `de` twice.
    expect(seen.at(-1)).toBe("de#2");
  });
});

describe("setLocale() with a loader", () => {
  const setup = (cached: Record<string, Record<string, string>> = {}) => {
    const l = manualLoader({ "uk:default": { g: "Привіт" }, "fr:default": { g: "Salut" } });
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { g: "Hello" }, ...cached },
      loader: l.load,
    });
    return { i18n, errors, ...l, seen: trace(i18n) };
  };

  it("switches inside the call when the target needs no load", async () => {
    const { i18n, requested, seen } = setup({ uk: { g: "Привіт" } });
    const p = i18n.setLocale("uk");
    expect(i18n.locale).toBe("uk");
    expect(seen).toEqual(["uk#1"]);
    await p;
    expect(requested).toEqual([]);
  });

  it("stays asynchronous and publishes the load start and end when the target is fetched", async () => {
    const { i18n, answer, requested, seen } = setup();
    const p = i18n.setLocale("uk");
    expect(i18n.locale).toBe("en");
    expect(state(i18n).ld).toEqual(["uk\0default"]);
    await answer("uk:default");
    await p;
    expect(requested).toEqual(["uk:default"]);
    expect(i18n.locale).toBe("uk");
    expect(i18n.t("g")).toBe("Привіт");
    // start, catalog in (load end), locale switch
    expect(seen).toEqual(["en#1", "en#2", "uk#3"]);
    expect(state(i18n).lrev).toBe(1);
  });

  it("a later switch supersedes one in flight: its load is aborted and its result discarded", async () => {
    const { i18n, answer, signals, seen } = setup({ de: { g: "Hallo" } });
    const toUk = i18n.setLocale("uk");
    await flush();
    const toDe = i18n.setLocale("de");
    expect(signals.get("uk:default")!.aborted).toBe(true);
    expect(i18n.locale).toBe("de");
    await answer("uk:default");
    await Promise.all([toUk, toDe]);
    expect(i18n.locale).toBe("de");
    expect(state(i18n).ld).toEqual([]);
    expect(seen.at(-1)).toBe("de#3");
    expect(state(i18n).c.default.uk).toBeUndefined();
  });

  it("back to the current locale mid-flight cancels the switch without a locale change", async () => {
    const { i18n, answer, seen } = setup();
    const toUk = i18n.setLocale("uk");
    const back = i18n.setLocale("en");
    await answer("uk:default");
    await Promise.all([toUk, back]);
    expect(i18n.locale).toBe("en");
    expect(state(i18n).lrev).toBe(0);
    expect(seen).toEqual(["en#1", "en#2"]);
  });

  it("a cached switch followed at once by one that must fetch ends at the fetched target", async () => {
    const { i18n, answer, requested } = setup({ uk: { g: "Привіт" } });
    const toUk = i18n.setLocale("uk");
    const toFr = i18n.setLocale("fr");
    expect(i18n.locale).toBe("uk");
    await answer("fr:default");
    await Promise.all([toUk, toFr]);
    expect(requested).toEqual(["fr:default"]);
    expect(i18n.locale).toBe("fr");
    expect(state(i18n).lrev).toBe(2);
  });

  it("does not move a destroyed instance, and a switch in flight at destroy() never lands", async () => {
    const { i18n, answer } = setup();
    const p = i18n.setLocale("uk");
    i18n.destroy();
    await answer("uk:default");
    await p;
    expect(i18n.locale).toBe("en");
    await i18n.setLocale("fr");
    expect(i18n.locale).toBe("en");
  });
});

describe("partial failure (R4-11)", () => {
  it("switches when one namespace of the target fails, and reports load_failed for it", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({
      locale: "en",
      fallbackLocale: "en",
      namespaces: ["default", "shop"],
      catalogs: { default: { en: { a: "A" } }, shop: { en: { s: "S" } } },
      loader: l.load,
    });
    const p = i18n.setLocale("uk");
    await l.answer("uk:default", { a: "А" });
    await l.fail("uk:shop");
    await expect(p).resolves.toBeUndefined();
    expect(i18n.locale).toBe("uk");
    expect(i18n.t("a")).toBe("А");
    expect(i18n.t("s", { ns: "shop" })).toBe("S"); // through the en fallback
    expect(errors.filter((e) => e.code === "load_failed")).toEqual([
      expect.objectContaining({ locale: "uk", ns: "shop", cause: expect.any(Error) }),
    ]);
  });

  it("rejects, and stays, when every catalog of the target fails", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
    const p = i18n.setLocale("fr");
    await l.fail("fr:default", new Error("404 fr"));
    await expect(p).rejects.toThrow("404 fr");
    expect(i18n.locale).toBe("en");
  });

  it("a failed fallback catalog never blocks the switch", async () => {
    const { load } = tableLoader(TABLE);
    const { i18n, errors } = make({ locale: "en", fallbackLocale: "xx", loader: load });
    await i18n.ready;
    await i18n.setLocale("de");
    expect(i18n.locale).toBe("de");
    expect(errors).toContainEqual(expect.objectContaining({ code: "load_failed", locale: "xx" }));
  });

  it("remembers a failure (no refetch on every switch) until the target is asked for again", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "de", fallbackLocale: "xx", loader: load });
    await i18n.ready;
    load.mockClear();
    await i18n.setLocale("fr");
    expect(loaded()).toEqual(["fr:default"]);
    await expect(i18n.setLocale("zz")).rejects.toThrow("no catalog for zz:default");
    await expect(i18n.setLocale("zz")).rejects.toThrow();
    // The target's own failure is retried when it is the target again.
    expect(loaded().filter((x) => x === "zz:default")).toHaveLength(2);
  });
});

describe("a parent of the locale's chain that fails (lot 2c, review A MEDIUM 3)", () => {
  const failed = (errors: { code: string; locale?: string; ns?: string }[]) =>
    errors.filter((e) => e.code === "load_failed").map((e) => `${e.locale}:${e.ns}`);

  it("pt-BR loads, pt 404s: nothing is reported — whichever answers first", async () => {
    for (const order of [
      ["pt:default", "pt-BR:default"],
      ["pt-BR:default", "pt:default"],
    ]) {
      const l = manualLoader();
      const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
      const p = i18n.setLocale("pt-BR");
      expect(l.requested).toEqual(["pt-BR:default", "pt:default"]);
      for (const k of order)
        if (k == "pt:default") await l.fail(k);
        else await l.answer(k, { a: "A-br" });
      await p;
      await flush();
      expect(i18n.locale).toBe("pt-BR");
      expect(failed(errors)).toEqual([]);
    }
  });

  it("pt-BR and pt both fail: both are reported — whichever answers first", async () => {
    for (const order of [
      ["pt:default", "pt-BR:default"],
      ["pt-BR:default", "pt:default"],
    ]) {
      const l = manualLoader();
      const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
      const p = i18n.setLocale("pt-BR");
      for (const k of order) await l.fail(k);
      await expect(p).rejects.toThrow("404 pt-BR:default");
      await flush();
      expect(failed(errors).sort()).toEqual(["pt-BR:default", "pt:default"]);
    }
  });

  it("per namespace: the parent's failure of a namespace is reported only with the locale's own failure of THAT namespace", async () => {
    const { load } = tableLoader({ "pt-BR:default": { a: "A-br" } });
    const { i18n, errors } = make({
      locale: "en",
      namespaces: ["default", "shop"],
      messages: { en: { a: "A" } },
      loader: load,
    });
    await i18n.setLocale("pt-BR");
    await flush();
    // pt:default is not reported (pt-BR:default loaded); pt:shop is (pt-BR:shop failed too).
    expect(failed(errors).sort()).toEqual(["pt-BR:shop", "pt:shop"]);
  });

  it("a parent asked for as the locale itself is reported as before", async () => {
    const { load } = tableLoader({ "en:default": { a: "A" } });
    const { i18n, errors } = make({ locale: "en", loader: load });
    await i18n.ready;
    await expect(i18n.setLocale("pt")).rejects.toThrow();
    expect(failed(errors)).toEqual(["pt:default"]);
  });

  it("a superseded switch: pt-BR → pt-PT reuses the pt flight; pt and pt-PT both fail → both are reported", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
    const first = i18n.setLocale("pt-BR");
    const p = i18n.setLocale("pt-PT");
    // pt-BR's flight is pruned; pt's goes on, now as pt-PT's parent.
    expect(l.signals.get("pt-BR:default")!.aborted).toBe(true);
    expect(l.signals.get("pt:default")!.aborted).toBe(false);
    await l.fail("pt:default");
    await l.fail("pt-PT:default");
    await expect(p).rejects.toThrow("404 pt-PT:default");
    await first;
    await flush();
    expect(failed(errors).sort()).toEqual(["pt-PT:default", "pt:default"]);
  });

  it("a flight started for pt itself and reused as pt-BR's parent: pt fails, pt-BR loads → nothing is reported", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
    const first = i18n.setLocale("pt");
    const p = i18n.setLocale("pt-BR");
    expect(l.requested).toEqual(["pt:default", "pt-BR:default"]);
    await l.fail("pt:default");
    await l.answer("pt-BR:default", { a: "A-br" });
    await p;
    await first;
    await flush();
    expect(i18n.locale).toBe("pt-BR");
    expect(failed(errors)).toEqual([]);
  });

  it("a flight started as pt-BR's parent and reused by a switch to pt itself: pt fails → reported, though pt-BR loads", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: { a: "A" } }, loader: l.load });
    const first = i18n.setLocale("pt-BR");
    const p = i18n.setLocale("pt");
    await l.answer("pt-BR:default", { a: "A-br" }).catch(() => {});
    await l.fail("pt:default");
    await expect(p).rejects.toThrow("404 pt:default");
    await first;
    await flush();
    expect(failed(errors)).toEqual(["pt:default"]);
  });

  it("a fallback locale's failure is reported as before, even when the locale loads", async () => {
    const { load } = tableLoader({ "pt-BR:default": { a: "A-br" } });
    const { i18n, errors } = make({ locale: "pt-BR", fallbackLocale: "en", loader: load });
    await i18n.ready;
    await flush();
    expect(failed(errors)).toEqual(["en:default"]);
  });
});

describe("the fallback chain", () => {
  it("a single fallback is loaded and answers a key the locale lacks", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "de", fallbackLocale: "en", loader: load });
    await i18n.ready;
    expect(i18n.t("c")).toBe("C-en");
    expect(loaded().sort()).toEqual(["de:default", "en:default"]);
  });

  it("a regional locale walks its parents first: de-AT → de → en", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "de-AT", fallbackLocale: "en", loader: load });
    await i18n.ready;
    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["A-at", "B-de", "C-en"]);
    expect(loaded().sort()).toEqual(["de-AT:default", "de:default", "en:default"]);
  });

  it("a fallback equal to the locale is loaded once", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "en", fallbackLocale: ["en", "en"], loader: load });
    await i18n.ready;
    expect(loaded()).toEqual(["en:default"]);
  });

  it("a fallback already in place is not requested", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { c: "C-inline" } },
      loader: load,
    });
    await i18n.ready;
    expect(i18n.t("c")).toBe("C-inline");
    expect(loaded()).toEqual(["de:default"]);
  });

  it("namespace activation loads the namespace for the locale and the fallback", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "de", fallbackLocale: "en", namespaces: [], loader: load });
    await i18n.load("extra");
    expect(i18n.t("x", { ns: "extra" })).toBe("X-en");
    expect(loaded().sort()).toEqual(["de:extra", "en:extra"]);
  });

  it("a locale switch does not request the fallback loaded before", async () => {
    const { load, loaded } = tableLoader(TABLE);
    const { i18n } = make({ locale: "de", fallbackLocale: "en", loader: load });
    await i18n.ready;
    load.mockClear();
    await i18n.setLocale("fr");
    expect(i18n.t("c")).toBe("C-en");
    expect(loaded()).toEqual(["fr:default"]);
  });

  it("per-locale fallback lists, with a default list for the others", () => {
    const { i18n } = make({
      locale: "pt-BR",
      fallbackLocale: { "pt-BR": ["es"], default: ["en"] },
      messages: { es: { a: "es" }, en: { a: "en", b: "en-b" } },
    });
    expect(i18n.t("a")).toBe("es");
    expect(i18n.t("b")).toBe("b");
    void i18n.setLocale("fr");
    expect(i18n.t("b")).toBe("en-b");
  });

  it("zh-HK never falls back to zh (Hans); zh-Hant-HK reaches zh-Hant", () => {
    const { i18n } = make({
      locale: "zh-HK",
      messages: { zh: { a: "简" }, "zh-Hant": { a: "繁" } },
    });
    expect(i18n.t("a")).toBe("a");
    void i18n.setLocale("zh-Hant-HK");
    expect(i18n.t("a")).toBe("繁");
  });

  it("text direction follows the locale's script", async () => {
    const { i18n } = make({ locale: "en" });
    expect(i18n.dir).toBe("ltr");
    await i18n.setLocale("ar-EG");
    expect(i18n.dir).toBe("rtl");
    await i18n.setLocale("he");
    expect(i18n.dir).toBe("rtl");
    await i18n.setLocale("az-Arab");
    expect(i18n.dir).toBe("rtl");
  });
});

describe("invalid locales are rejected before anything renders or loads (R3-1, R4-10)", () => {
  it.each(["", "!!", "a/b", "de?x=1", "..", "en@x"])(
    "setLocale(%j) rejects with invalid_locale and requests nothing",
    async (bad) => {
      const { load } = tableLoader(TABLE);
      const { i18n, errors } = make({ locale: "en", loader: load });
      await i18n.ready;
      load.mockClear();
      await expect(i18n.setLocale(bad)).rejects.toThrow(RangeError);
      expect(load).not.toHaveBeenCalled();
      expect(i18n.locale).toBe("en");
      expect(errors).toContainEqual(
        expect.objectContaining({ code: "invalid_locale", locale: bad }),
      );
    },
  );

  it.each(["!!", "", "not a locale"])(
    "createI18n({ locale: %j }) throws a RangeError before plugins, the loader or a report (lot 4d)",
    (bad) => {
      const setup = vi.fn();
      const loader = vi.fn(async () => ({}));
      const onError = vi.fn();
      expect(() =>
        createI18n({
          locale: bad,
          fallbackLocale: "en",
          loader,
          onError,
          plugins: [{ name: "p", setup }],
        }),
      ).toThrow(RangeError);
      expect(setup).not.toHaveBeenCalled();
      expect(loader).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it("a valid start locale with no catalog loads and falls back as usual; Intl need not know it", () => {
    const { i18n, errors } = make({
      locale: "xx",
      fallbackLocale: "en",
      messages: { en: { a: "A" } },
    });
    expect(i18n.locale).toBe("xx");
    expect(i18n.t("a")).toBe("A");
    expect(errors.map((e) => e.code)).not.toContain("invalid_locale");
  });
});
