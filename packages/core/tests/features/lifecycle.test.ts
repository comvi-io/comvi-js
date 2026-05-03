import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";
import type { I18nPlugin } from "../../src";

/**
 * Focus on observable lifecycle behavior:
 * - loading state transitions during init
 * - destroy() cleanup that is visible via public API
 * - load error notifications
 * - initialized event behavior
 */
describe("I18n Lifecycle", () => {
  describe("Loading States", () => {
    it("emits loadingStateChanged transitions that start initializing and end idle", async () => {
      const states: Array<{ isLoading: boolean; isInitializing: boolean }> = [];
      const i18n = new I18n({ locale: "en" });

      i18n.on("loadingStateChanged", (state) => {
        states.push({ ...state });
      });

      expect(i18n.isInitializing).toBe(false);
      await i18n.init();

      expect(states[0]).toEqual({ isLoading: true, isInitializing: true });
      expect(states[states.length - 1]).toEqual({ isLoading: false, isInitializing: false });
      expect(i18n.isLoading).toBe(false);
      expect(i18n.isInitializing).toBe(false);
    });
  });

  describe("destroy()", () => {
    it("cleans plugin hooks and cached translations", async () => {
      const onDestroyed = vi.fn();
      const cleanup = vi.fn();
      const plugin: I18nPlugin = (i18n) => {
        i18n.registerLoader(async () => ({ key: "value" }));
        // Return current language to avoid unintended language switch in this test.
        i18n.registerLocaleDetector(() => "en");
        return cleanup;
      };

      const i18n = new I18n({ locale: "en" }).use(plugin);
      i18n.addTranslations({ en: { hello: "Hello" } });
      await i18n.init();

      const loaderResult = await i18n.getLoader()!("en", "default");
      expect(loaderResult).toEqual({ key: "value" });

      expect(i18n.getLanguageDetector()!()).toBe("en");

      expect(i18n.t("hello")).toBe("Hello");
      i18n.on("destroyed", onDestroyed);

      await i18n.destroy();

      // destroy() resets isInitialized to false because the instance is no longer active
      expect(i18n.isInitialized).toBe(false);
      expect(onDestroyed).toHaveBeenCalledTimes(1);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(i18n.getLoader()).toBeUndefined();
      expect(i18n.getLanguageDetector()).toBeUndefined();
      expect(i18n.getLoadedLocales()).toEqual([]);
      expect(i18n.t("hello")).toBe("hello");
    });

    it("cleans up even when called during an active load", async () => {
      let resolveLoad!: (value: Record<string, string>) => void;
      const loadPromise = new Promise<Record<string, string>>((res) => {
        resolveLoad = res;
      });

      const plugin: I18nPlugin = (i18n) => {
        i18n.registerLoader(async () => loadPromise);
      };

      const i18n = new I18n({ locale: "en", ns: [] }).use(plugin);
      await i18n.init();
      const loadingStates: Array<{ isLoading: boolean; isInitializing: boolean }> = [];
      i18n.on("loadingStateChanged", (state) => {
        loadingStates.push(state);
      });

      // Start a load, putting i18n in isLoading state
      const addPromise = i18n.addActiveNamespace("slow");
      expect(i18n.isLoading).toBe(true);

      // Destroy while the load is still pending
      await i18n.destroy();

      expect(i18n.isLoading).toBe(false);
      expect(i18n.isInitializing).toBe(false);
      expect(loadingStates[loadingStates.length - 1]).toEqual({
        isLoading: false,
        isInitializing: false,
      });
      expect(i18n.getLoader()).toBeUndefined();
      expect(i18n.getLoadedLocales()).toEqual([]);

      // Resolve the pending load after destroy.
      resolveLoad({ key: "value" });
      await addPromise;

      // The completed in-flight load must not repopulate the destroyed instance.
      expect(i18n.getLoadedLocales()).toEqual([]);
      expect(i18n.t("key", { ns: "slow" })).toBe("key");
    });
  });

  describe("onLoadError", () => {
    it("fires callbacks with locale/namespace and emits loadError", async () => {
      const onLoadError = vi.fn();
      const onEvent = vi.fn();
      const testError = new Error("Load failed");

      const failingLoader: I18nPlugin = (i18n) => {
        i18n.registerLoader(async () => {
          throw testError;
        });
      };

      const i18n = new I18n({ locale: "en", ns: [] }).use(failingLoader);
      i18n.onLoadError(onLoadError);
      i18n.on("loadError", onEvent);
      await i18n.init();

      await expect(i18n.addActiveNamespace("test")).rejects.toThrow();

      expect(onLoadError).toHaveBeenCalledWith("en", "test", testError);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "en", namespace: "test", error: testError }),
      );
    });

    it("supports unsubscribing load error handlers", async () => {
      const onLoadError = vi.fn();

      const failingLoader: I18nPlugin = (i18n) => {
        i18n.registerLoader(async () => {
          throw new Error("boom");
        });
      };

      const i18n = new I18n({ locale: "en", ns: [] }).use(failingLoader);
      const unsubscribe = i18n.onLoadError(onLoadError);
      await i18n.init();

      unsubscribe();
      await expect(i18n.addActiveNamespace("ns")).rejects.toThrow();

      expect(onLoadError).not.toHaveBeenCalled();
    });
  });

  describe("Initialized Event", () => {
    it("isolates listener failures and continues notifying other listeners", async () => {
      const onError = vi.fn();
      const failingListener = vi.fn(() => {
        throw new Error("listener failed");
      });
      const healthyListener = vi.fn();
      const i18n = new I18n({ locale: "en", onError });

      i18n.on("initialized", failingListener);
      i18n.on("initialized", healthyListener);

      await expect(i18n.init()).resolves.toBe(i18n);

      expect(failingListener).toHaveBeenCalledTimes(1);
      expect(healthyListener).toHaveBeenCalledTimes(1);
      expect(i18n.isInitialized).toBe(true);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ source: "event", event: "initialized" }),
      );
    });

    it("emits initialized after successful init", async () => {
      const callback = vi.fn();
      const i18n = new I18n({ locale: "en" });

      i18n.on("initialized", callback);
      await i18n.init();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("does not emit initialized when init fails", async () => {
      const callback = vi.fn();
      const failingPlugin: I18nPlugin = () => {
        throw new Error("boom");
      };

      const i18n = new I18n({ locale: "en" }).use(failingPlugin);
      i18n.on("initialized", callback);

      await expect(i18n.init()).rejects.toThrow();

      expect(callback).not.toHaveBeenCalled();
      expect(i18n.isInitialized).toBe(false);
    });
  });
});
