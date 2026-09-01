/**
 * The instance-level contracts around the reactive getters, `destroy()` and
 * `install()` — including the two failure paths that only a host whose
 * `init()` / `destroy()` rejects can reach.
 */
import { describe, it, expect, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { flushPromises } from "@vue/test-utils";
import { attachLoader, createCore, createI18n, createI18nFromCore } from "../src";

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const blankApp = () => createApp(defineComponent({ render: () => null }));

describe("VueI18n reactive getters", () => {
  it.each([
    "locale",
    "defaultParams",
    "dir",
    "loadedLocales",
    "activeNamespaces",
    "defaultNamespace",
  ] as const)("returns the same %s ref on every access", (getter) => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(i18n[getter]).toBe(i18n[getter]);
  });

  it("formats with an explicit locale argument instead of the current one", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    // Every literal is a function of the explicit "de" argument alone; the
    // date carries a `timeZone` so the machine's zone cannot reach it.
    expect(i18n.formatNumber(1234.5, undefined, "de")).toBe("1.234,5");
    expect(i18n.formatCurrency(12, "EUR", undefined, "de")).toBe("12,00 €");
    expect(i18n.formatDate(new Date("2026-08-02T00:00:00Z"), { timeZone: "UTC" }, "de")).toBe(
      "2.8.2026",
    );
    expect(i18n.formatRelativeTime(-1, "day", undefined, "de")).toBe("vor 1 Tag");
    expect(i18n.locale.value).toBe("en");
  });
});

describe("VueI18n destroy()", () => {
  it("destroys the host once even when called repeatedly", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    await i18n.init();
    const destroyHost = vi.spyOn(i18n.core, "destroy");

    i18n.destroy();
    i18n.destroy();

    expect(destroyHost).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected host destroy through onError", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", exposeGlobal: false, onError });
    const failure = new Error("cleanup exploded");
    vi.spyOn(i18n.core, "destroy").mockRejectedValue(failure);

    i18n.destroy();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(failure, { source: "plugin-cleanup" });
  });
});

describe("VueI18n install()", () => {
  it("provides itself once when installed into the same app twice", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const app = blankApp();
    const provide = vi.spyOn(app, "provide");

    i18n.install(app);
    i18n.install(app);

    expect(provide).toHaveBeenCalledTimes(1);
  });

  it("does not initialize a host that is already initialized", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    await i18n.init();
    const initHost = vi.spyOn(i18n.core, "init");

    i18n.install(blankApp());

    expect(initHost).not.toHaveBeenCalled();
  });

  it("does not initialize a host whose own init is still in flight", async () => {
    const slowLoad = createDeferred();
    const i18n = createI18nFromCore(
      createCore({ locale: "en", defaultNs: "common" }).with(attachLoader),
    );
    i18n.core.registerLoader(async () => {
      await slowLoad.promise;
      return { hello: "Hello" };
    });
    const initializing = i18n.init();
    const initHost = vi.spyOn(i18n.core, "init");

    i18n.install(blankApp());

    expect(initHost).not.toHaveBeenCalled();

    slowLoad.resolve();
    await initializing;
  });

  it("reports a rejected install-time init through onError", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", exposeGlobal: false, onError });
    const failure = new Error("init exploded");
    vi.spyOn(i18n.core, "init").mockRejectedValue(failure);

    i18n.install(blankApp());
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(failure, { source: "init" });
  });

  it("wraps a non-Error install-time init rejection in an Error", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", exposeGlobal: false, onError });
    vi.spyOn(i18n.core, "init").mockRejectedValue("the host is gone");

    i18n.install(blankApp());
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { source: "init" });
    expect((onError.mock.calls[0][0] as Error).message).toBe("the host is gone");
  });
});
