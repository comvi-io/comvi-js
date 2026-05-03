import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { I18n } from "../../src";
import type { I18nPlugin } from "../../src";

/**
 * Focus on the error-handling contract:
 * - required plugins fail fast
 * - optional plugins degrade gracefully
 * - timeouts protect init
 * - cleanup runs in LIFO order and continues on errors
 */
describe("Plugin Error Handling", () => {
  describe("Required Plugins", () => {
    it("throws when a required plugin fails during init", async () => {
      const failingPlugin: I18nPlugin = () => {
        throw new Error("Plugin initialization failed");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(failingPlugin);

      await expect(i18n.init()).rejects.toThrow("Plugin initialization failed");
    });

    it("propagates async plugin rejection", async () => {
      const failingPlugin: I18nPlugin = async () => {
        throw new Error("Async plugin error");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(failingPlugin);

      await expect(i18n.init()).rejects.toThrow("Async plugin error");
    });
  });

  describe("Optional Plugins", () => {
    it("continues after optional plugin failure and calls onError", async () => {
      const executionOrder: string[] = [];
      const errorHandler = vi.fn();

      const failingPlugin: I18nPlugin = () => {
        executionOrder.push("failing");
        throw new Error("Optional plugin error");
      };

      const successPlugin: I18nPlugin = () => {
        executionOrder.push("success");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(failingPlugin, { required: false, onError: errorHandler });
      i18n.use(successPlugin);

      await i18n.init();

      expect(executionOrder).toEqual(["failing", "success"]);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0].message).toBe("Optional plugin error");
    });

    it("calls onError and throws for required plugin failure", async () => {
      const errorHandler = vi.fn();
      const failingPlugin: I18nPlugin = () => {
        throw new Error("Plugin error");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(failingPlugin, { required: true, onError: errorHandler });

      await expect(i18n.init()).rejects.toThrow(/Plugin error/);

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0].message).toBe("Plugin error");
    });

    it("continues optional plugin flow when plugin onError handler throws", async () => {
      const executionOrder: string[] = [];

      const failingPlugin: I18nPlugin = () => {
        executionOrder.push("failing");
        throw new Error("plugin failed");
      };

      const successPlugin: I18nPlugin = () => {
        executionOrder.push("success");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(failingPlugin, {
        required: false,
        onError: () => {
          throw new Error("onError failed");
        },
      });
      i18n.use(successPlugin, { required: true });

      await expect(i18n.init()).resolves.toBe(i18n);

      expect(executionOrder).toEqual(["failing", "success"]);
    });
  });

  describe("Timeout Protection", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it("rejects when a required plugin times out", async () => {
      const slowPlugin: I18nPlugin = () => new Promise(() => {});

      const i18n = new I18n({ locale: "en" });
      i18n.use(slowPlugin, { required: true, timeout: 100 });

      const initPromise = i18n.init();
      vi.advanceTimersByTime(150);

      await expect(initPromise).rejects.toThrow(/timed out|E_PLUGIN_INIT_TIMEOUT/);
    });

    it("continues after an optional plugin times out", async () => {
      const executionOrder: string[] = [];

      const slowPlugin: I18nPlugin = () => new Promise(() => {});
      const fastPlugin: I18nPlugin = () => {
        executionOrder.push("fast");
      };

      const i18n = new I18n({ locale: "en" });
      i18n.use(slowPlugin, { required: false, timeout: 100 });
      i18n.use(fastPlugin, { required: true });

      const initPromise = i18n.init();
      vi.advanceTimersByTime(150);

      await expect(initPromise).resolves.toBe(i18n);
      expect(executionOrder).toEqual(["fast"]);
    });
  });

  describe("Cleanup Functions", () => {
    it("calls cleanup functions in LIFO order", async () => {
      const executionOrder: number[] = [];

      const plugin1: I18nPlugin = () => () => executionOrder.push(1);
      const plugin2: I18nPlugin = () => () => executionOrder.push(2);
      const plugin3: I18nPlugin = () => () => executionOrder.push(3);

      const i18n = new I18n({ locale: "en" });
      i18n.use(plugin1);
      i18n.use(plugin2);
      i18n.use(plugin3);

      await i18n.init();
      await i18n.destroy();

      expect(executionOrder).toEqual([3, 2, 1]);
    });

    it("continues cleanup even if one throws", async () => {
      const onError = vi.fn();
      const cleanupOrder: string[] = [];
      const cleanup1 = vi.fn(() => {
        cleanupOrder.push("cleanup1");
      });
      const cleanup2 = vi.fn(() => {
        cleanupOrder.push("cleanup2");
        throw new Error("Cleanup error");
      });
      const cleanup3 = vi.fn(() => {
        cleanupOrder.push("cleanup3");
      });

      const i18n = new I18n({ locale: "en", onError });
      i18n.use(() => cleanup1);
      i18n.use(() => cleanup2);
      i18n.use(() => cleanup3);

      await i18n.init();
      await i18n.destroy();

      expect(cleanup3).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanupOrder).toEqual(["cleanup3", "cleanup2", "cleanup1"]);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ source: "plugin-cleanup" }),
      );
    });

    it("awaits async cleanup functions", async () => {
      let destroyFinished = false;
      let resolveCleanup!: () => void;

      const cleanupPromise = new Promise<void>((resolve) => {
        resolveCleanup = resolve;
      });

      const i18n = new I18n({ locale: "en" });
      i18n.use(() => () => cleanupPromise);
      await i18n.init();

      const destroyPromise = i18n.destroy().then(() => {
        destroyFinished = true;
      });

      await Promise.resolve();
      expect(destroyFinished).toBe(false);

      resolveCleanup();
      await destroyPromise;

      expect(destroyFinished).toBe(true);
    });
  });
});
