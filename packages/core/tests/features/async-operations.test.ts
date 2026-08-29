import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { I18nPlugin } from "../helpers/composedHost";
import { createDeferred, type Deferred } from "../helpers/deferred";

type Catalog = Record<string, string>;

describe("setLocaleAsync() / addActiveNamespace() concurrency", () => {
  it("setLocaleAsync uses latest request and ignores stale results", async () => {
    const deferreds = new Map<string, Deferred<Catalog>>();
    const pending = (key: string): Deferred<Catalog> => {
      const existing = deferreds.get(key);
      if (existing) return existing;
      const created = createDeferred<Catalog>();
      deferreds.set(key, created);
      return created;
    };

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (lang, ns) => pending(`${lang}:${ns}`).promise);
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    const addPromise = i18n.addActiveNamespace("common");
    pending("en:common").resolve({ key: "value_en" });
    await addPromise;

    const toFr = i18n.setLocaleAsync("fr");
    const toDe = i18n.setLocaleAsync("de");
    const toEs = i18n.setLocaleAsync("es");

    pending("es:common").resolve({ key: "value_es" });
    pending("fr:common").resolve({ key: "value_fr" });
    pending("de:common").resolve({ key: "value_de" });
    await Promise.all([toFr, toDe, toEs]);

    expect(i18n.locale).toBe("es");
    expect(i18n.t("key", { ns: "common" })).toBe("value_es");
  });

  it("deduplicates concurrent namespace loads", async () => {
    const loader = vi.fn();
    const deferred = createDeferred<Catalog>();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (lang, ns) => {
        loader(lang, ns);
        return deferred.promise;
      });
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    const activations = [
      i18n.addActiveNamespace("shared"),
      i18n.addActiveNamespace("shared"),
      i18n.addActiveNamespace("shared"),
    ];
    deferred.resolve({ key: "value" });
    await Promise.all(activations);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("en", "shared");
    expect(i18n.t("key", { ns: "shared" })).toBe("value");
  });

  it("does not re-invoke the loader for an already-loaded namespace", async () => {
    const loader = vi.fn();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (lang, ns) => {
        loader(lang, ns);
        return { key: "value" };
      });
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();
    await i18n.addActiveNamespace("shared");

    await i18n.addActiveNamespace("shared");

    expect(loader).toHaveBeenCalledTimes(1);
    expect(i18n.t("key", { ns: "shared" })).toBe("value");
  });

  it("keeps isLoading true until all overlapping loads finish", async () => {
    const ns1 = createDeferred<Catalog>();
    const ns2 = createDeferred<Catalog>();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (_lang, ns) => (ns === "ns1" ? ns1.promise : ns2.promise));
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    const p1 = i18n.addActiveNamespace("ns1");
    const p2 = i18n.addActiveNamespace("ns2");

    expect(i18n.isLoading).toBe(true);

    ns1.resolve({ key: "value1" });
    await p1;
    expect(i18n.isLoading).toBe(true);

    ns2.resolve({ key: "value2" });
    await p2;
    expect(i18n.isLoading).toBe(false);
  });

  it("recovers loading state after failed namespace load", async () => {
    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (_lang, ns) => {
        if (ns === "failing") {
          throw new Error("Load failed");
        }
        return { key: "value" };
      });
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    await expect(i18n.addActiveNamespace("failing")).rejects.toThrow(
      /Failed to load all namespaces|E_ALL_NAMESPACES_FAILED/,
    );
    expect(i18n.isLoading).toBe(false);
  });
});
