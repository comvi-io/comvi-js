/**
 * Concurrent `init()` calls share ONE attempt. The slot is cleared only after
 * that attempt settles, so a later sequential `init()` keeps the documented
 * re-init behaviour (it drains the plugin queue again).
 */
import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedInstance";
import { createDeferred } from "../helpers/deferred";
import { flushMicrotasks } from "../helpers/flush";

describe("concurrent init()", () => {
  it("runs the plugins once and keeps isInitializing until the shared attempt settles", async () => {
    const gate = createDeferred<void>();
    const plugin = vi.fn(async () => {
      if (plugin.mock.calls.length === 1) await gate.promise;
    });
    const initialized = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false });
    i18n.registerPlugin(plugin);
    i18n.on("initialized", initialized);

    const first = i18n.init();
    const second = i18n.init();
    await flushMicrotasks();

    expect(plugin).toHaveBeenCalledTimes(1);
    expect(i18n.isInitializing).toBe(true);
    expect(i18n.isInitialized).toBe(false);

    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([i18n, i18n]);
    expect(plugin).toHaveBeenCalledTimes(1);
    expect(initialized).toHaveBeenCalledTimes(1);
    expect(i18n.isInitializing).toBe(false);
    expect(i18n.isInitialized).toBe(true);
  });

  it("shares a rejection, then lets a sequential retry start a new attempt", async () => {
    const gate = createDeferred<void>();
    let calls = 0;
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(async () => {
      calls++;
      if (calls === 1) {
        await gate.promise;
        throw new Error("first attempt fails");
      }
    });

    const first = i18n.init();
    const second = i18n.init();
    gate.resolve();
    await expect(first).rejects.toThrow("first attempt fails");
    await expect(second).rejects.toThrow("first attempt fails");
    expect(calls).toBe(1);

    await expect(i18n.init()).resolves.toBe(i18n);
    expect(calls).toBe(2);
    expect(i18n.isInitialized).toBe(true);
  });

  it("joins a call re-entered from a synchronous loadingStateChanged listener", async () => {
    const plugin = vi.fn();
    const initialized = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false });
    i18n.registerPlugin(plugin);
    i18n.on("initialized", initialized);
    let nested: Promise<unknown> | undefined;
    i18n.on("loadingStateChanged", ({ isLoading }) => {
      if (isLoading && nested === undefined) nested = i18n.init();
    });

    const outer = i18n.init();
    // The synchronous isInitializing transition stays part of the contract.
    expect(i18n.isInitializing).toBe(true);
    await Promise.all([outer, nested]);

    expect(nested).toBe(outer);
    expect(plugin).toHaveBeenCalledTimes(1);
    expect(initialized).toHaveBeenCalledTimes(1);
    expect(i18n.isInitialized).toBe(true);
  });
});
