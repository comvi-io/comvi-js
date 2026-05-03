import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";
import type { I18nPlugin } from "../../src";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("Async Operations", () => {
  it("setLocaleAsync uses latest request and ignores stale results", async () => {
    const deferreds = new Map<string, ReturnType<typeof createDeferred<Record<string, string>>>>();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (lang, ns) => {
        const key = `${lang}:${ns}`;
        if (!deferreds.has(key)) {
          deferreds.set(key, createDeferred());
        }
        return deferreds.get(key)!.promise;
      });
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    // Ensure a namespace is active so loaders run on language change
    const enKey = "en:common";
    deferreds.set(enKey, createDeferred());
    const addPromise = i18n.addActiveNamespace("common");
    deferreds.get(enKey)!.resolve({ key: "value_en" });
    await addPromise;

    const p1 = i18n.setLocaleAsync("fr");
    const p2 = i18n.setLocaleAsync("de");
    const p3 = i18n.setLocaleAsync("es");

    // Resolve latest language first, then stale ones
    deferreds.get("es:common")!.resolve({ key: "value_es" });
    deferreds.get("fr:common")!.resolve({ key: "value_fr" });
    deferreds.get("de:common")!.resolve({ key: "value_de" });

    await Promise.all([p1, p2, p3]);

    expect(i18n.locale).toBe("es");

    // Verify that the active translation is from the winning language (es)
    expect(i18n.t("key", { ns: "common" })).toBe("value_es");
  });

  it("deduplicates concurrent namespace loads", async () => {
    const loader = vi.fn();
    const deferred = createDeferred<Record<string, string>>();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (lang, ns) => {
        loader(lang, ns);
        return deferred.promise;
      });
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();

    const p1 = i18n.addActiveNamespace("shared");
    const p2 = i18n.addActiveNamespace("shared");
    const p3 = i18n.addActiveNamespace("shared");

    expect(loader).toHaveBeenCalledTimes(1);

    deferred.resolve({ key: "value" });
    await Promise.all([p1, p2, p3]);

    // Verify the translation data was actually stored correctly
    expect(i18n.t("key", { ns: "shared" })).toBe("value");
  });

  it("keeps isLoading true until all overlapping loads finish", async () => {
    const ns1 = createDeferred<Record<string, string>>();
    const ns2 = createDeferred<Record<string, string>>();

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(async (_lang, ns) => {
        return ns === "ns1" ? ns1.promise : ns2.promise;
      });
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

    await expect(i18n.addActiveNamespace("failing")).rejects.toThrow();
    expect(i18n.isLoading).toBe(false);
  });
});
