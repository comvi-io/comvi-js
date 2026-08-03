import { describe, it, expect, vi } from "vitest";
import { createI18n } from "@comvi/core";
import { loader, attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader, FETCH_LOADER_PLUGIN_KEY } from "../src/index";
import { mockCdnSuccessResponse, mockCdnErrorResponse, TEST_CDN_URL } from "./setup";

/**
 * The plugin ecosystem on a COMPOSED SLIM host (framework-slim DX-2).
 *
 * The question this file answers is the one the 0.5.0 slim tiers raise: **does
 * a real, published plugin still work when the host is a bare `@comvi/core`
 * instance that acquired its capabilities by EXPLICIT composition —
 * `.with(loader()).with(plugins())`?** Nothing is inherited from an entry:
 * since the single-entry convergence `@comvi/core`'s root IS the base host, so
 * those two subpaths are precisely what put `registerLoader` and
 * `setPluginData` on the instance under test.
 *
 * Nothing here is a stub. `FetchLoader` is the shipped plugin, imported from
 * this package's own source, and every core specifier resolves through the
 * workspace link to `@comvi/core`'s BUILT dist — i.e. the published exports
 * map, the terser-mangled internals and the real chunk graph. A slim host
 * reaches the plugin's two requirements from two different subpaths
 * (`setPluginData` from `/plugins`, `registerLoader` from `/loader`), so this
 * is also the end-to-end proof that the descriptor-copy composition keeps
 * cross-capability plugins working.
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

    // 1. the plugin registered its loader through the /loader capability
    expect(typeof i18n.getLoader()).toBe("function");
    // 2. …and stored its config through the /plugins capability
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toMatchObject({
      cdnUrl: TEST_CDN_URL,
    });
    // 3. translations actually arrived over the mocked transport
    expect(i18n.t("greeting")).toBe("Hello");

    // 4. the registered loader keeps serving locale switches
    await i18n.setLocaleAsync("fr");
    expect(i18n.t("greeting")).toBe("Bonjour");

    // 5. the plugin's cleanup runs on destroy, and host state resets
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
