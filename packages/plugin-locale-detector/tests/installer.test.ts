import { describe, expect, it, vi } from "vitest";
import { createI18n, hasLoaderApi } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import type { I18nPlugin } from "@comvi/core";
import { LocaleDetector, localeDetector } from "../src/index";
import { mockWindowLocation } from "./setup";

/**
 * The LOWERCASE installer (single-entry convergence, plan §4).
 *
 * `localeDetector(options)` is the one-call form of `.with(plugins())` then
 * `.use(LocaleDetector(options))`. It must produce the same host, the same
 * lifecycle and the same teardown — it routes into `use`, it does not
 * re-implement anything — and it must reject the two cross-uses that the type
 * system also rejects.
 */
const base = () => createI18n({ locale: "en", exposeGlobal: false });
const QS_ONLY = { order: ["querystring" as const], caches: [] };

describe("localeDetector() installer", () => {
  it("composes the plugin capability and detects at init", async () => {
    mockWindowLocation("?lng=fr");

    const i18n = base().with(localeDetector(QS_ONLY));

    expect(typeof i18n.use).toBe("function");
    expect(typeof i18n.registerLocaleDetector).toBe("function");
    // Composition attaches; the PLUGIN registers, and it runs at init().
    expect(i18n.getLanguageDetector()).toBeUndefined();
    expect(i18n.locale).toBe("en");

    await i18n.init();

    expect(typeof i18n.getLanguageDetector()).toBe("function");
    expect(i18n.locale).toBe("fr");
  });

  it("is the same host as the explicit recipe", async () => {
    mockWindowLocation("?lng=de");

    const installed = base().with(localeDetector(QS_ONLY));
    const explicit = base().with(plugins());
    explicit.use(LocaleDetector(QS_ONLY));

    await Promise.all([installed.init(), explicit.init()]);

    expect(installed.locale).toBe("de");
    expect(explicit.locale).toBe("de");
  });

  it("composes no loader capability", () => {
    const i18n = base().with(localeDetector());

    // Probed through `hasLoaderApi`, not `registerLoader === undefined`: since
    // core's B4 fix a plugins-only host carries a BRANDED throwing stand-in
    // for every loader member, so the member exists while the capability does
    // not — and calling it says exactly that.
    expect(hasLoaderApi(i18n)).toBe(false);
    expect(() => (i18n as unknown as { registerLoader: () => void }).registerLoader()).toThrow(
      /no loader capability/,
    );
  });

  it("returns the same instance and keeps registered state when composed twice", async () => {
    mockWindowLocation("?lng=uk");

    const i18n = base().with(plugins());
    i18n.setPluginData("existing", "kept");

    const again = i18n.with(localeDetector(QS_ONLY));

    expect(again).toBe(i18n);
    expect(again.getPluginData("existing")).toBe("kept");

    await again.init();
    expect(again.locale).toBe("uk");
  });

  it("keeps the plugin's cleanup on the host's LIFO teardown", async () => {
    mockWindowLocation("?lng=fr");
    const order: string[] = [];

    const i18n = base().with(localeDetector(QS_ONLY));
    i18n.use(() => () => void order.push("after"));

    await i18n.init();
    await i18n.destroy();

    // The installer's plugin was queued FIRST, so its cleanup runs LAST.
    expect(order).toEqual(["after"]);
    expect(i18n.getLanguageDetector()).toBeUndefined();
  });
});

describe("localeDetector() wrong use", () => {
  it("fails at init through .use(), before anything is attached", async () => {
    mockWindowLocation("?lng=fr");

    const i18n = base().with(plugins());
    i18n.use(localeDetector(QS_ONLY) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/localeDetector\(\) is a \.with\(…\) installer/);

    // Nothing was registered, so the locale was never touched.
    expect(i18n.getLanguageDetector()).toBeUndefined();
    expect(i18n.locale).toBe("en");
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("rejects the uppercase factory handed to .with()", () => {
    const i18n = base();

    // `.with` is a dumb pipe: it CALLS what you give it. A plugin handed to it
    // runs against a host that has none of the capabilities it needs.
    expect(() => i18n.with(LocaleDetector(QS_ONLY))).toThrow(TypeError);
    expect((i18n as Record<string, unknown>).use).toBeUndefined();
  });

  it("still installs normally after a rejected .use() attempt", async () => {
    mockWindowLocation("?lng=fr");

    const i18n = base().with(plugins());
    i18n.use(localeDetector(QS_ONLY) as unknown as I18nPlugin, {
      required: false,
      onError: vi.fn(),
    });

    await i18n.init();
    expect(i18n.locale).toBe("en");

    // The guard is transient: outside the drain loop the same installer works.
    expect(i18n.with(localeDetector(QS_ONLY))).toBe(i18n);
  });
});
