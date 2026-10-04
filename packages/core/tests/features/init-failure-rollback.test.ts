/**
 * A failed `init()` is transactional: the cleanups its own plugins returned
 * run (LIFO) before the rejection, so a rejected or retried host leaks
 * nothing. Cleanups from an EARLIER successful init stay until `destroy()`.
 */
import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { I18nPlugin } from "../helpers/composedHost";

function resourcePlugin(log: string[], name: string): I18nPlugin {
  return () => {
    log.push(`acquire ${name}`);
    return () => void log.push(`release ${name}`);
  };
}

const failing: I18nPlugin = () => {
  throw new Error("required plugin failed");
};

describe("failed init() rolls back its own cleanups", () => {
  it("releases earlier plugins' resources when a required plugin throws, on every retry", async () => {
    const log: string[] = [];
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(resourcePlugin(log, "a"));
    i18n.registerPlugin(resourcePlugin(log, "b"));
    i18n.registerPlugin(failing);

    await expect(i18n.init()).rejects.toThrow("required plugin failed");
    expect(log).toEqual(["acquire a", "acquire b", "release b", "release a"]);

    await expect(i18n.init()).rejects.toThrow("required plugin failed");
    expect(log.filter((l) => l.startsWith("release"))).toHaveLength(4);

    await i18n.destroy();
    expect(log.filter((l) => l.startsWith("release"))).toHaveLength(4);
  });

  it("releases plugin resources when the initial namespace load fails", async () => {
    const log: string[] = [];
    const i18n = new I18n({ locale: "en", exposeGlobal: false, onError: () => {} });
    i18n.registerLoader(async () => {
      throw new Error("network down");
    });
    i18n.registerPlugin(resourcePlugin(log, "a"));

    await expect(i18n.init()).rejects.toThrow();
    expect(log).toEqual(["acquire a", "release a"]);
  });

  it("keeps the cleanups of an earlier successful init()", async () => {
    const log: string[] = [];
    let fail = false;
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerPlugin(resourcePlugin(log, "a"));
    i18n.registerPlugin(() => {
      if (fail) throw new Error("second init fails");
    });

    await i18n.init();
    fail = true;
    await expect(i18n.init()).rejects.toThrow("second init fails");
    expect(log).toEqual(["acquire a", "acquire a", "release a"]);

    await i18n.destroy();
    expect(log).toEqual(["acquire a", "acquire a", "release a", "release a"]);
  });

  it("reports a throwing rollback cleanup and still runs the rest", async () => {
    const log: string[] = [];
    const onError = vi.fn();
    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError });
    i18n.registerPlugin(resourcePlugin(log, "a"));
    i18n.registerPlugin(() => () => {
      throw new Error("cleanup broke");
    });
    i18n.registerPlugin(failing);

    await expect(i18n.init()).rejects.toThrow("required plugin failed");
    expect(log).toEqual(["acquire a", "release a"]);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "cleanup broke" }),
      expect.objectContaining({ source: "plugin-cleanup" }),
    );
  });
});
