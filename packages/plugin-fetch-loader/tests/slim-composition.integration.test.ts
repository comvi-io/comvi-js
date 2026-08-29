import { describe, it, expect, vi } from "vitest";
import { createI18n } from "@comvi/core";
import { loader, attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader, FETCH_LOADER_PLUGIN_KEY } from "../src/index";
import { mockCdnSuccessResponse, mockCdnErrorResponse, TEST_CDN_URL } from "./setup";

/**
 * A real published plugin on a host that acquired its capabilities by explicit
 * composition — `.with(loader()).with(plugins())`. Nothing here is a stub:
 * every core specifier resolves through the workspace link to `@comvi/core`'s
 * BUILT dist, so the terser-mangled internals and the real exports map are
 * what the plugin runs against. The plugin's two requirements come from two
 * different subpaths (`registerLoader` from `/loader`, `setPluginData` from
 * `/plugins`), which is what makes this the end-to-end proof that
 * descriptor-copy composition keeps cross-capability plugins working.
 *
 * It lives here rather than beside core's own `slim-composition.test.ts`
 * because `@comvi/core` must not devDepend on a package that peer-depends on
 * it — turbo's build graph would cycle.
 */
describe("published plugins on a composed slim host", () => {
  const composed = () =>
    createI18n({ locale: "en", exposeGlobal: false, devMode: false })
      .with(loader())
      .with(plugins());

  it("registers the loader, loads translations and cleans up on destroy", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    mockCdnSuccessResponse("fr", "default", { greeting: "Bonjour" });

    const i18n = composed();

    // Before the plugin runs the host is composed but unconfigured.
    expect(i18n.getLoader()).toBeUndefined();

    i18n.use(FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true }));
    await i18n.init();

    expect(typeof i18n.getLoader()).toBe("function");
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toMatchObject({
      cdnUrl: TEST_CDN_URL,
    });
    expect(i18n.t("greeting")).toBe("Hello");

    await i18n.setLocaleAsync("fr");
    expect(i18n.t("greeting")).toBe("Bonjour");

    await i18n.destroy();
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toBeUndefined();
  });

  it("aborts the plugin's in-flight requests when the composed host is destroyed", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    const onLoadError = vi.fn();

    const i18n = composed();
    i18n.use(FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true, onLoadError }));
    await i18n.init();
    await i18n.destroy();

    // The cleanup returned by the plugin aborts its controllers; a destroyed
    // host must not surface an abort as a load error.
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("surfaces load failures through both the plugin callback and the host", async () => {
    mockCdnErrorResponse("en", "default", 500, "boom");
    const onLoadError = vi.fn();

    const i18n = composed();
    i18n.use(FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true, onLoadError }));

    // The plugin registers its loader and core drives the initial namespace
    // load, so a total failure propagates out of init() exactly as it does on
    // the root entry — composition changes the install path, not the contract.
    await expect(i18n.init()).rejects.toThrow(/Failed to load all namespaces/);

    expect(onLoadError).toHaveBeenCalledOnce();
    expect(onLoadError.mock.calls[0]![0]).toBe("en");

    await i18n.destroy();
  });

  it("behaves identically on the low-level attach form", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    const piped = composed();
    const attached = attachLoader(
      createI18n({ locale: "en", exposeGlobal: false, devMode: false }),
    ).with(plugins());

    for (const host of [piped, attached]) {
      host.use(FetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: true }));
      await host.init();
      expect(host.t("greeting")).toBe("Hello");
    }

    await Promise.all([piped.destroy(), attached.destroy()]);
  });

  it("a loader-only host cannot host the plugin — plugins() is what adds use()", () => {
    const loaderOnly = createI18n({ locale: "en", exposeGlobal: false }).with(loader());

    expect((loaderOnly as Record<string, unknown>).use).toBeUndefined();
    expect(typeof loaderOnly.with(plugins()).use).toBe("function");
  });
});
