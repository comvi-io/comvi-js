import { describe, it, expect, vi } from "vitest";
import { createI18n, hasLoaderApi } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import type { I18nPlugin } from "@comvi/core";
import { FETCH_LOADER_PLUGIN_KEY, FetchLoader, fetchLoader } from "../src/index";
import { mockCdnSuccessResponse, TEST_CDN_URL } from "./setup";

/**
 * `fetchLoader(options)` is the one-call form of the recipe the composed-host
 * suite spells out: `.with(loader()).with(plugins())` then
 * `.use(FetchLoader(options))` — same host, same lifecycle, same teardown, and
 * it must reject the two cross-uses the type system also rejects.
 */
const base = () => createI18n({ locale: "en", exposeGlobal: false, devMode: false });
const OPTIONS = { cdnUrl: TEST_CDN_URL, loadOnInit: true };

describe("fetchLoader() installer", () => {
  it("composes both capabilities and loads through the plugin", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    mockCdnSuccessResponse("fr", "default", { greeting: "Bonjour" });

    const i18n = base().with(fetchLoader(OPTIONS));

    expect(typeof i18n.registerLoader).toBe("function");
    expect(typeof i18n.use).toBe("function");
    // Composition attaches; the PLUGIN registers, and it runs at init().
    expect(i18n.getLoader()).toBeUndefined();

    await i18n.init();

    expect(typeof i18n.getLoader()).toBe("function");
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toMatchObject({ cdnUrl: TEST_CDN_URL });
    expect(i18n.t("greeting")).toBe("Hello");

    await i18n.setLocaleAsync("fr");
    expect(i18n.t("greeting")).toBe("Bonjour");

    await i18n.destroy();
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toBeUndefined();
  });

  it("is the same host as the explicit recipe", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    const installed = base().with(fetchLoader(OPTIONS));
    const explicit = base().with(loader()).with(plugins());
    explicit.use(FetchLoader(OPTIONS));

    for (const host of [installed, explicit]) {
      await host.init();
      expect(host.t("greeting")).toBe("Hello");
    }

    await Promise.all([installed.destroy(), explicit.destroy()]);
  });

  it("returns the same instance and keeps registered state when composed twice", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    const i18n = base().with(loader()).with(plugins());
    const marker: I18nPlugin = () => undefined;
    i18n.use(marker);
    i18n.setPluginData("existing", "kept");

    const again = i18n.with(fetchLoader(OPTIONS));

    expect(again).toBe(i18n);
    expect(again.getPluginData("existing")).toBe("kept");

    await again.init();
    expect(again.t("greeting")).toBe("Hello");
    await again.destroy();
  });

  it("reports a missing cdnUrl at COMPOSITION time, not at init", () => {
    expect(() => base().with(fetchLoader({ cdnUrl: "" }))).toThrow(/cdnUrl is required/);
  });

  it("keeps the plugin's cleanup on the host's LIFO teardown", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    const order: string[] = [];

    const i18n = base().with(fetchLoader(OPTIONS));
    i18n.use(() => () => void order.push("after"));

    await i18n.init();
    await i18n.destroy();

    // The installer's plugin was queued FIRST, so its cleanup runs LAST.
    expect(order).toEqual(["after"]);
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toBeUndefined();
  });
});

describe("fetchLoader() wrong use", () => {
  it("fails at init through .use(), before anything is attached", async () => {
    const i18n = base().with(plugins());
    i18n.use(fetchLoader(OPTIONS) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/fetchLoader\(\) is a \.with\(…\) installer/);

    // The nested-use guard is the FIRST ensure-step: no loader capability.
    // Probed through `hasLoaderApi`, not `registerLoader === undefined`: a
    // plugins-only host carries a branded throwing stand-in for every loader
    // member, so the member exists while the capability does not.
    expect(hasLoaderApi(i18n)).toBe(false);
    // …no plugin data, so the plugin never reached the queue…
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toBeUndefined();
    // …and nothing to tear down.
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("rejects the uppercase factory handed to .with()", async () => {
    const i18n = base();

    // `.with` is a dumb pipe: it CALLS what you give it. A plugin handed to it
    // runs against a host that has none of the capabilities it needs, so the
    // invocation is rejected rather than silently half-installing.
    await expect(i18n.with(FetchLoader(OPTIONS)) as unknown as Promise<void>).rejects.toThrow(
      TypeError,
    );

    expect((i18n as Record<string, unknown>).registerLoader).toBeUndefined();
    expect((i18n as Record<string, unknown>).use).toBeUndefined();
  });

  it("still installs normally after a rejected .use() attempt", async () => {
    const i18n = base().with(plugins());
    i18n.use(fetchLoader(OPTIONS) as unknown as I18nPlugin, { required: false, onError: vi.fn() });

    await i18n.init();

    // The guard is transient: outside the drain loop the same installer works.
    const composed = i18n.with(fetchLoader(OPTIONS));
    expect(composed).toBe(i18n);
    expect(typeof composed.registerLoader).toBe("function");

    await i18n.destroy();
  });
});
