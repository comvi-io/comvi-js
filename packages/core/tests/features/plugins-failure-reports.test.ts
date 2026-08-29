/**
 * What a plugin failure REPORTS, and what the drain loop leaves behind.
 *
 * `plugin-error-handling.test.ts` pins WHICH failures propagate (required vs.
 * optional, timeout, cleanup); this file pins what a consumer actually sees
 * when one does: the error the host reports, the context naming the plugin,
 * the dev warning when the plugin's OWN handler throws — and the timer the
 * timeout guard must not leave running behind a plugin that finished in time.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createI18n } from "../../src";
import { plugins } from "../../src/plugins";
import { createDeferred } from "../helpers/deferred";

const makeHost = (onError?: (error: Error, context?: unknown) => void) =>
  createI18n({ locale: "en", onError, translation: { en: { hi: "Hi" } } }).with(plugins());

afterEach(() => {
  vi.useRealTimers();
});

describe("plugin failure reports", () => {
  it("names the failing plugin function in the report context", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    const trackingPlugin = () => {
      throw new Error("boom");
    };
    i18n.use(trackingPlugin, { required: false });

    await i18n.init();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), {
      source: "plugin",
      pluginName: "trackingPlugin",
    });
  });

  it("reports an unnamed plugin as anonymous", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.use(
      () => {
        throw new Error("boom");
      },
      { required: false },
    );

    await i18n.init();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), {
      source: "plugin",
      pluginName: "anonymous",
    });
  });

  it("wraps a non-Error rejection in an initialization-failed message", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.use(() => Promise.reject("socket hung up"), { required: false });

    await i18n.init();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Plugin initialization failed: socket hung up" }),
      expect.objectContaining({ source: "plugin" }),
    );
  });

  it("warns when the plugin's own onError handler throws, and still reports the original error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.use(
      () => {
        throw new Error("boom");
      },
      {
        required: false,
        onError: () => {
          throw new Error("handler exploded");
        },
      },
    );

    await i18n.init();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toBe(
      "[i18n] Plugin error handler failed: handler exploded",
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      expect.objectContaining({ source: "plugin" }),
    );
  });

  it("stays silent when a failing plugin registered no handler of its own", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.use(
      () => {
        throw new Error("boom");
      },
      { required: false },
    );

    await i18n.init();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("plugin timeout guard", () => {
  it("schedules a timer while the plugin is pending and clears it on resolve (sequence)", async () => {
    vi.useFakeTimers();
    const plugin = createDeferred<void>();
    const i18n = makeHost();
    i18n.use(() => plugin.promise, { timeout: 5000 });

    const init = i18n.init();

    expect(vi.getTimerCount()).toBe(1);

    plugin.resolve(undefined);
    await init;

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("locale detector", () => {
  it("keeps the configured locale when the detector returns an empty string", async () => {
    const i18n = makeHost();
    i18n.use((host) => {
      host.registerLocaleDetector(() => "");
    });

    await i18n.init();

    expect(i18n.locale).toBe("en");
  });
});
