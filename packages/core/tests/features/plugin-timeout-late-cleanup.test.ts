/**
 * A plugin that exceeds its timeout keeps running. When it later returns a
 * cleanup, that cleanup is owned: registered while the host is live, run at
 * once if the attempt failed or the host was destroyed. An invalid late
 * return is reported, never silently dropped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { I18n } from "../helpers/composedHost";
import { createDeferred } from "../helpers/deferred";

type Cleanup = () => void;

describe("a timed-out plugin's late cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("optional timeout: a late cleanup runs on destroy()", async () => {
    const late = createDeferred<Cleanup>();
    const cleaned = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(() => late.promise, { required: false, timeout: 100 });

    const initPromise = i18n.init();
    await vi.advanceTimersByTimeAsync(150);
    await expect(initPromise).resolves.toBe(i18n);

    late.resolve(cleaned);
    await vi.advanceTimersByTimeAsync(0);
    await i18n.destroy();

    expect(cleaned).toHaveBeenCalledTimes(1);
  });

  it("required timeout: a late cleanup of the failed attempt runs at once", async () => {
    const late = createDeferred<Cleanup>();
    const cleaned = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(() => late.promise, { required: true, timeout: 100 });

    const initPromise = i18n.init();
    const rejection = expect(initPromise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(150);
    await rejection;

    late.resolve(cleaned);
    await vi.advanceTimersByTimeAsync(0);

    expect(cleaned).toHaveBeenCalledTimes(1);
  });

  it("destroy() before the late resolution: the cleanup runs when it arrives", async () => {
    const late = createDeferred<Cleanup>();
    const cleaned = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(() => late.promise, { required: false, timeout: 100 });

    const initPromise = i18n.init();
    await vi.advanceTimersByTimeAsync(150);
    await initPromise;
    await i18n.destroy();

    late.resolve(cleaned);
    await vi.advanceTimersByTimeAsync(0);

    expect(cleaned).toHaveBeenCalledTimes(1);
  });

  it("reports an invalid late return through onError", async () => {
    const late = createDeferred<unknown>();
    const onError = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError });
    i18n.registerPlugin(() => late.promise as Promise<void>, { required: false, timeout: 100 });

    const initPromise = i18n.init();
    await vi.advanceTimersByTimeAsync(150);
    await initPromise;
    onError.mockClear();

    late.resolve(i18n);
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("returned a value") }),
      expect.objectContaining({ source: "plugin" }),
    );
  });
});
