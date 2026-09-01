/**
 * `setLocale`'s serialization queue and the requested-locale bookkeeping the
 * `locale` setters guard on: which change wins, which load is skipped, and
 * where a failure is reported.
 */
import { describe, it, expect, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { attachLoader, createCore, createI18n, createI18nFromCore } from "../src";
import type { I18nOptions } from "../src";

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const createLoaderI18n = (options: Partial<I18nOptions> = {}) =>
  createI18nFromCore(
    createCore({ locale: "en", defaultNs: "common", ...options } as I18nOptions).with(attachLoader),
  );

// A queued change starts one microtask after the task ahead of it settles, so
// draining the queue takes one flush per still-chained task.
const drainLocaleQueue = async () => {
  await flushPromises();
  await flushPromises();
};

const loadsOf = (loader: ReturnType<typeof vi.fn>, locale: string) =>
  loader.mock.calls.filter(([requested]) => requested === locale);

describe("VueI18n locale queue", () => {
  it("holds the next load until the change in flight settles, then applies it", async () => {
    const slowFrench = createDeferred();
    const loader = vi.fn(async (locale: string) => {
      if (locale === "fr") await slowFrench.promise;
      return { hello: locale };
    });
    const i18n = createLoaderI18n();
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();

    const french = i18n.setLocale("fr");
    const german = i18n.setLocale("de");
    await flushPromises();

    expect(loadsOf(loader, "de")).toHaveLength(0);

    slowFrench.resolve();
    await Promise.all([french, german]);

    expect(loadsOf(loader, "de")).toHaveLength(1);
    expect(i18n.locale.value).toBe("de");
  });

  it("holds a change requested after the queue head settles until the queued one settles too", async () => {
    const slowFrench = createDeferred();
    const slowGerman = createDeferred();
    const loader = vi.fn(async (locale: string) => {
      if (locale === "fr") await slowFrench.promise;
      if (locale === "de") await slowGerman.promise;
      return { hello: locale };
    });
    const i18n = createLoaderI18n();
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();

    const french = i18n.setLocale("fr");
    const german = i18n.setLocale("de");
    slowFrench.resolve();
    await french;
    const spanish = i18n.setLocale("es");
    await flushPromises();

    expect(loadsOf(loader, "es")).toHaveLength(0);

    slowGerman.resolve();
    await Promise.all([german, spanish]);

    expect(loadsOf(loader, "es")).toHaveLength(1);
    expect(i18n.locale.value).toBe("es");
  });

  it("starts the next change immediately once the queue has drained", async () => {
    const loader = vi.fn(async (locale: string) => ({ hello: locale }));
    const i18n = createLoaderI18n();
    i18n.core.registerLoader(loader);
    await i18n.init();
    await i18n.setLocale("fr");

    const german = i18n.setLocale("de");

    expect(i18n.isLoading.value).toBe(true);
    await german;
  });

  it("issues one load when the same locale is requested twice while it is loading", async () => {
    const onError = vi.fn();
    const loader = vi.fn(async (locale: string) => {
      if (locale === "fr") throw new Error("fr unavailable");
      return { hello: locale };
    });
    const i18n = createLoaderI18n({ onError });
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();

    i18n.locale.value = "fr";
    i18n.locale.value = "fr";
    await drainLocaleQueue();

    expect(loadsOf(loader, "fr")).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("retries a locale whose previous change failed", async () => {
    const onError = vi.fn();
    const loader = vi.fn(async (locale: string) => {
      if (locale === "fr") throw new Error("fr unavailable");
      return { hello: locale };
    });
    const i18n = createLoaderI18n({ onError });
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();

    await expect(i18n.setLocale("fr")).rejects.toThrow(
      '[i18n] Failed to load all namespaces for locale "fr": common',
    );
    i18n.locale.value = "fr";
    await drainLocaleQueue();

    expect(loadsOf(loader, "fr")).toHaveLength(2);
  });

  it("keeps the newer requested locale when an earlier change fails", async () => {
    const slowGerman = createDeferred();
    const onError = vi.fn();
    const loader = vi.fn(async (locale: string) => {
      if (locale === "fr") throw new Error("fr unavailable");
      if (locale === "de") {
        await slowGerman.promise;
        throw new Error("de unavailable");
      }
      return { hello: locale };
    });
    const i18n = createLoaderI18n({ onError });
    i18n.core.registerLoader(loader);
    await i18n.init();
    loader.mockClear();

    const french = i18n.setLocale("fr").catch(() => {});
    const german = i18n.setLocale("de").catch(() => {});
    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledWith("de", "common");
    });
    // "de" is already the requested locale, so this assignment is a no-op —
    // the failed "fr" change must not have reset the bookkeeping to "en".
    i18n.locale.value = "de";
    slowGerman.resolve();
    await Promise.all([french, german]);
    await drainLocaleQueue();

    expect(loadsOf(loader, "de")).toHaveLength(1);
  });

  it("routes a host locale failure to onError with source setLocale via the ref setter", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", exposeGlobal: false, onError });
    const failure = new Error("host refused the locale");
    vi.spyOn(i18n.core, "setLocaleAsync").mockRejectedValue(failure);

    i18n.locale.value = "fr";
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(failure, { source: "setLocale" });
  });

  it("routes a host locale failure to onError with source setLocale via the instance setter", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", exposeGlobal: false, onError });
    const failure = new Error("host refused the locale");
    vi.spyOn(i18n.core, "setLocaleAsync").mockRejectedValue(failure);

    i18n.locale = "fr";
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(failure, { source: "setLocale" });
  });
});
