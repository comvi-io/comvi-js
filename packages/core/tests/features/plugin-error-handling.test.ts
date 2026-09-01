import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { I18nPlugin } from "../helpers/composedHost";
import { flushMicrotasks } from "../helpers/flush";

/**
 * The plugin error-handling contract: required plugins fail fast, optional ones
 * degrade, timeouts protect `init()`, and cleanup runs LIFO and continues past
 * an error.
 */

describe("init() with a required plugin", () => {
  it("propagates async plugin rejection", async () => {
    const failingPlugin: I18nPlugin = async () => {
      throw new Error("Async plugin error");
    };

    const i18n = new I18n({ locale: "en" });
    i18n.use(failingPlugin);

    await expect(i18n.init()).rejects.toThrow("Async plugin error");
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
});

describe("init() with an optional plugin", () => {
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

describe("init() plugin timeout protection", () => {
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
    // Attached before the clock moves: advancing async drains the microtask
    // queue, so an unattached rejection would surface as an unhandled one.
    const rejection = expect(initPromise).rejects.toThrow(/timed out after 100ms/);

    await vi.advanceTimersByTimeAsync(150);

    await rejection;
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
    await vi.advanceTimersByTimeAsync(150);

    await expect(initPromise).resolves.toBe(i18n);
    expect(executionOrder).toEqual(["fast"]);
  });
});

describe("destroy() plugin cleanup", () => {
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

    const i18n = new I18n({ locale: "en", onError });
    i18n.use(() => () => {
      cleanupOrder.push("cleanup1");
    });
    i18n.use(() => () => {
      cleanupOrder.push("cleanup2");
      throw new Error("Cleanup error");
    });
    i18n.use(() => () => {
      cleanupOrder.push("cleanup3");
    });

    await i18n.init();
    await i18n.destroy();

    expect(cleanupOrder).toEqual(["cleanup3", "cleanup2", "cleanup1"]);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Cleanup error" }),
      expect.objectContaining({ source: "plugin-cleanup" }),
    );
  });

  it("awaits async cleanup functions", async () => {
    const order: string[] = [];
    let resolveCleanup!: () => void;

    const cleanupPromise = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });

    const i18n = new I18n({ locale: "en" });
    i18n.use(() => () => cleanupPromise);
    await i18n.init();

    const destroyPromise = i18n.destroy().then(() => {
      order.push("destroy-done");
    });

    // A macrotask boundary drains every pending microtask, so a `destroy()`
    // that did NOT await the cleanup promise would already have settled here.
    await flushMicrotasks();

    expect(order).toEqual([]);

    order.push("cleanup-resolved");
    resolveCleanup();
    await destroyPromise;

    expect(order).toEqual(["cleanup-resolved", "destroy-done"]);
  });
});
