import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { createI18n, hasLoaderApi } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import type { I18nPlugin } from "@comvi/core";
import { FETCH_LOADER_PLUGIN_KEY, fetchLoaderPlugin, fetchLoader } from "../src/index";
import { buildTestCdnUrl, mockCdnSuccessResponse, server, TEST_CDN_URL } from "./setup";

/**
 * `fetchLoader(options)` is the one-call form of the recipe the composed-host
 * suite spells out: `.use(attachLoader).use(plugins())` then
 * `registerPlugin(fetchLoaderPlugin(options))` — same host, same lifecycle, same teardown, and
 * it must reject the two cross-uses the type system also rejects.
 */
const base = () => createI18n({ locale: "en", exposeGlobal: false, devMode: false });
const OPTIONS = { cdnUrl: TEST_CDN_URL, loadOnInit: true };

describe("fetchLoader() installer", () => {
  it("composes both capabilities and loads through the plugin", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    mockCdnSuccessResponse("fr", "default", { greeting: "Bonjour" });

    const i18n = base().use(fetchLoader(OPTIONS));

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

    const installed = base().use(fetchLoader(OPTIONS));
    const explicit = base().use(attachLoader).use(plugins());
    explicit.registerPlugin(fetchLoaderPlugin(OPTIONS));

    await installed.init();
    await explicit.init();

    expect([installed.t("greeting"), explicit.t("greeting")]).toEqual(["Hello", "Hello"]);

    await Promise.all([installed.destroy(), explicit.destroy()]);
  });

  it("returns the same instance and keeps registered state when composed twice", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });

    const i18n = base().use(attachLoader).use(plugins());
    const marker: I18nPlugin = () => undefined;
    i18n.registerPlugin(marker);
    i18n.setPluginData("existing", "kept");

    const again = i18n.use(fetchLoader(OPTIONS));

    expect(again).toBe(i18n);
    expect(again.getPluginData("existing")).toBe("kept");

    await again.init();
    expect(again.t("greeting")).toBe("Hello");
    await again.destroy();
  });

  it("reports a missing cdnUrl at COMPOSITION time, not at init", () => {
    expect(() => base().use(fetchLoader({ cdnUrl: "" }))).toThrow(/cdnUrl is required/);
  });

  /**
   * `loadOnInit` gates the plugin's OWN install-time load, and the plugin body
   * runs inside `init()` where that load is always skipped. `init()` then loads
   * the initial namespaces through the registered loader on its own, so
   * `loadOnInit: false` suppresses nothing on this path. Pinned so the next
   * attempt to make the flag mean "no request during init()" is visible;
   * `options.ts` documents `ns: []` as the actual opt-out (pinned below).
   */
  it("still issues the initial request when loadOnInit is false, because init() owns that load", async () => {
    let requests = 0;
    server.use(
      http.get(buildTestCdnUrl("en", "default"), () => {
        requests += 1;
        return HttpResponse.json({ greeting: "Hello" });
      }),
    );

    const i18n = base().use(fetchLoader({ cdnUrl: TEST_CDN_URL, loadOnInit: false }));
    await i18n.init();

    expect(requests).toBe(1);
    expect(i18n.t("greeting")).toBe("Hello");

    await i18n.destroy();
  });

  it("makes no request at all when core is told to load no initial namespace", async () => {
    let requests = 0;
    server.use(
      http.get(buildTestCdnUrl("en", "default"), () => {
        requests += 1;
        return HttpResponse.json({ greeting: "Hello" });
      }),
    );

    const i18n = createI18n({ locale: "en", exposeGlobal: false, devMode: false, ns: [] }).use(
      fetchLoader({ cdnUrl: TEST_CDN_URL }),
    );
    await i18n.init();

    expect(requests).toBe(0);

    // …and the loader is registered, so a namespace loads on demand.
    await i18n.addActiveNamespace("default");
    expect(requests).toBe(1);
    expect(i18n.t("greeting")).toBe("Hello");

    await i18n.destroy();
  });

  it("keeps the plugin's cleanup on the host's LIFO teardown", async () => {
    mockCdnSuccessResponse("en", "default", { greeting: "Hello" });
    const order: string[] = [];

    const i18n = base().use(fetchLoader(OPTIONS));
    i18n.registerPlugin(() => () => void order.push("after"));

    await i18n.init();
    await i18n.destroy();

    // The installer's plugin was queued FIRST, so its cleanup runs LAST.
    expect(order).toEqual(["after"]);
    expect(i18n.getPluginData(FETCH_LOADER_PLUGIN_KEY)).toBeUndefined();
  });
});

describe("fetchLoader() wrong use", () => {
  it("fails at init through registerPlugin(), before anything is attached", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(fetchLoader(OPTIONS) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/fetchLoader\(\) is a \.use installer/);

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

  it("rejects the `*Plugin` factory handed to .use()", () => {
    const i18n = base();

    // `fetchLoaderPlugin` is an ASYNC plugin, so calling it returns a Promise —
    // which any "did it return an object?" probe would wave through, leaving
    // the plugin running at composition time with its rejection unhandled.
    // `.use`'s rule is IDENTITY: the Promise is not the host, so this throws
    // synchronously with the actionable code, and `.use` swallows the rejected
    // promise the already-invoked plugin left behind (no unhandled rejection
    // on top of a clear diagnostic — vitest would fail the file for one).
    expect(() =>
      i18n.use(fetchLoaderPlugin(OPTIONS) as unknown as Parameters<typeof i18n.use>[0]),
    ).toThrow(expect.objectContaining({ code: "E_USE_NOT_INSTALLER" }));

    expect((i18n as unknown as Record<string, unknown>).registerLoader).toBeUndefined();
    expect((i18n as unknown as Record<string, unknown>).registerPlugin).toBeUndefined();
  });

  /**
   * A late `.use(fetchLoader(…))` registers nothing, so the loader
   * capability's recovery advice ("call reloadTranslations() or
   * addActiveNamespace()") cannot work: the plugin that would have called
   * `registerLoader` never runs. The late-compose warning is once per host, so
   * the plugin capability's message — the accurate one — has to claim the slot.
   */
  it("warns with the plugin-queue message, not the loader's impossible recovery advice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = base();
    await i18n.init();

    const late = i18n.use(fetchLoader(OPTIONS));
    const messages = warn.mock.calls.map((call) => String(call[0]));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(".use(plugins()) ran after init()");
    expect(messages[0]).toContain("a plugin queued now will never run");
    expect(messages[0]).not.toContain("reloadTranslations()");

    // Why the loader message would have been wrong: no loader was registered,
    // so neither advertised recovery does anything.
    expect(late.getLoader()).toBeUndefined();
    await expect(late.reloadTranslations()).rejects.toThrow(/No loader registered/);
    await expect(late.addActiveNamespace("other")).resolves.toBeUndefined();

    await late.destroy();
  });

  it("still installs normally after a rejected registerPlugin() attempt", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(fetchLoader(OPTIONS) as unknown as I18nPlugin, {
      required: false,
      onError: vi.fn(),
    });

    await i18n.init();

    // The guard is transient: outside the drain loop the same installer works.
    const composed = i18n.use(fetchLoader(OPTIONS));
    expect(composed).toBe(i18n);
    expect(typeof composed.registerLoader).toBe("function");

    await i18n.destroy();
  });
});
