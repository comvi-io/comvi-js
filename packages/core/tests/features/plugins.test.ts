import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { I18nPlugin } from "../helpers/composedHost";
import { createDeferred } from "../helpers/deferred";

/**
 * `registerPlugin(plugin, options?)` — the plugin host's raw queue. Renamed
 * from `use()` by decision E, which gave `use` to the composition pipe: these
 * cases pin the queue's OWN contract under the new name, so the rename cannot
 * quietly turn a queued plugin into a synchronously-run installer.
 */
describe("I18n#registerPlugin()", () => {
  it("is the plugin host's member and is chainable, returning the host", () => {
    const i18n = new I18n({ locale: "en" });

    expect(i18n.registerPlugin(() => {})).toBe(i18n);
    expect("use" in i18n).toBe(true); // the composition pipe, a different member
    expect(i18n.registerPlugin).not.toBe(i18n.use);
  });

  it("defers: nothing runs before init(), everything runs inside it", async () => {
    const ran: string[] = [];
    const i18n = new I18n({ locale: "en", ns: [] })
      .registerPlugin(() => void ran.push("a"))
      .registerPlugin(() => void ran.push("b"));

    expect(ran).toEqual([]);
    await i18n.init();
    expect(ran).toEqual(["a", "b"]);
  });

  it("warns in development when called after init(): the plugin does not run now, the next init() drains it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = new I18n({ locale: "en", ns: [] });
      const early = vi.fn();
      i18n.registerPlugin(early);
      await i18n.init();
      expect(early).toHaveBeenCalledTimes(1);

      const late = vi.fn();
      i18n.registerPlugin(late);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("registerPlugin() was called after init()");
      // The warning's whole point: nothing happened. It is NOT discarded
      // though, which is what the warning now says — see below.
      expect(late).not.toHaveBeenCalled();

      await i18n.init();

      expect(late).toHaveBeenCalledTimes(1);
      // Together with everything already queued, which is the cost the
      // warning names.
      expect(early).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("I18n#registerPlugin() — execution, ordering and failure", () => {
  it("executes plugins sequentially and in order", async () => {
    const executionOrder: string[] = [];
    const gate = createDeferred<void>();

    const plugin1: I18nPlugin = async () => {
      executionOrder.push("start-1");
      await gate.promise;
      executionOrder.push("end-1");
    };

    const plugin2: I18nPlugin = async () => {
      executionOrder.push("start-2");
      executionOrder.push("end-2");
    };

    const i18n = new I18n({ locale: "en" }).registerPlugin(plugin1).registerPlugin(plugin2);

    const initPromise = i18n.init();

    // Plugin 1 is parked on the gate and plugin 2 must not have started,
    // because `init()` runs the queue sequentially. waitFor rather than a
    // counted `await Promise.resolve()`: the claim is the ordering, not how
    // many microtasks `init()` spends before the first plugin runs.
    await vi.waitFor(() => expect(executionOrder).toEqual(["start-1"]));

    gate.resolve();
    await initPromise;

    expect(executionOrder).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("allows plugins to register loaders", async () => {
    const loader = vi.fn(async () => ({ loaded: "yes" }));

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(loader);
    };

    const i18n = new I18n({ locale: "en", ns: [] }).registerPlugin(loaderPlugin);
    await i18n.init();
    await i18n.addActiveNamespace("test");

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("en", "test");
    expect(i18n.t("loaded", { ns: "test" })).toBe("yes");
  });

  it("runs post-processors in order and passes output along the chain", async () => {
    const addPrefix: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? `[prefix]${val}` : val));
    };

    const addSuffix: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? `${val}[suffix]` : val));
    };

    const i18n = new I18n({ locale: "en" }).registerPlugin(addPrefix).registerPlugin(addSuffix);
    i18n.addTranslations({ en: { test: "value" } });
    await i18n.init();

    expect(i18n.t("test")).toBe("[prefix]value[suffix]");
  });

  it("continues the post-processor chain when one throws", async () => {
    const throwingPlugin: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor(() => {
        throw new Error("Processor error");
      });
    };

    const upperCasePlugin: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? val.toUpperCase() : val));
    };

    const i18n = new I18n({ locale: "en" })
      .registerPlugin(throwingPlugin)
      .registerPlugin(upperCasePlugin);
    i18n.addTranslations({ en: { test: "hello" } });
    await i18n.init();

    expect(i18n.t("test")).toBe("HELLO");
  });

  it("keeps original value when a single post-processor throws", async () => {
    const i18n = new I18n({ locale: "en" });
    i18n.registerPostProcessor(() => {
      throw new Error("single processor failed");
    });
    i18n.addTranslations({ en: { test: "value" } });

    await i18n.init();

    expect(i18n.t("test")).toBe("value");
  });

  it("rejects non-function post processors", () => {
    const i18n = new I18n({ locale: "en" });

    expect(() => i18n.registerPostProcessor("invalid" as any)).toThrow(
      /registerPostProcessor\(\): argument must be a function/,
    );
  });
});
