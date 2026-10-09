/**
 * The bare-name installer, under BOTH export conditions, against the real
 * editor runtime. "The editor runs" is read the way a translator reads it:
 * Alt+hover on rendered text shows the key.
 *
 * Default entry: `inContextEditor(options)` ensures discovery and the plugin
 * host, then routes into `use` — it re-implements no lifecycle.
 * `production` entry: the same name and the same type, but the body is
 * `(host) => host` — no discovery, no capability, no plugin.
 *
 * The two wrong-use MECHANISMS are both proved here, because this package is
 * the only one that ships both. `registerPlugin(inContextEditor(…))` on the default
 * entry hits the nested-use guard at the first ensure-step; on the production
 * entry there is no ensure-step to hit, so the identity no-op runs and the
 * plugin host's return-shape guard rejects the host it handed back.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDevtools } from "@comvi/core/devtools";
import { plugins } from "@comvi/core/plugins";
import type { I18nPlugin } from "@comvi/core";
import { asPluginHost, createI18n } from "./helpers/composedInstance";
import { createI18n as createBaseI18n } from "@comvi/core";
import { inContextEditorPlugin, inContextEditor } from "../src/index";
import {
  inContextEditorPlugin as ProdPlugin,
  inContextEditor as prodInContextEditor,
} from "../src/entry-production";
import { resetApiConfig } from "../src/config/api";
import { resetEncoder } from "../src/translation";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import {
  hoverLabel,
  hoverLabelNow,
  hoverOverlayStyle,
  renderMarked,
  renderText,
} from "./helpers/editorPage";

const MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";

const base = () =>
  createBaseI18n({
    locale: "en",
    defaultNs: "default",
    exposeGlobal: false,
    messages: { "en:default": { hello: "Hello" } },
  });

/** The discovery queue the devtools capability publishes onto. */
const browserGlobals = globalThis as Record<string, unknown>;

/** Every host a test initialized, destroyed afterwards so no runtime outlives its test. */
const liveHosts: Array<{ destroy: () => Promise<void> }> = [];
function track<T extends { destroy: () => Promise<void> }>(host: T): T {
  liveHosts.push(host);
  return host;
}

afterEach(async () => {
  await Promise.allSettled(liveHosts.splice(0).map((host) => host.destroy()));
  delete browserGlobals.__COMVI__;
  cleanupDOM();
  resetApiConfig();
  resetEncoder();
});

describe("inContextEditor() installer — default entry", () => {
  it("use(inContextEditor()) → the host is announced with a discovery instanceId", () => {
    const i18n = track(base().use(inContextEditor()));

    expect(i18n.instanceId).toBeDefined();
  });

  it("use(inContextEditor()) before init() → rendered text is not highlighted yet", async () => {
    track(base().use(inContextEditor()));

    const heading = renderMarked("home.title");

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("init() → the host's rendered translations are highlighted", async () => {
    const i18n = track(base().use(inContextEditor()));

    await i18n.init();

    expect(await hoverLabel(renderText(i18n.t("hello")))).toBe("hello");
  });

  it("init() → the key-mappings bridge is published on the host", async () => {
    const i18n = track(base().use(inContextEditor()));

    await i18n.init();

    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeDefined();
  });

  it("destroy() → the host's rendered translations are no longer highlighted", async () => {
    const i18n = base().use(inContextEditor());
    await i18n.init();
    const heading = renderText(i18n.t("hello"));

    await i18n.destroy();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("hands the host back unchanged — the widening is deliberately none", () => {
    const host = base();

    expect(host.use(inContextEditor())).toBe(host);
  });

  it("inContextEditor({ targetElement }) → text inside the target is highlighted", async () => {
    const target = document.createElement("section");
    document.body.appendChild(target);
    const i18n = track(base().use(inContextEditor({ targetElement: target })));

    await i18n.init();

    expect(await hoverLabel(renderText(i18n.t("hello"), target))).toBe("hello");
  });

  it("inContextEditor({ targetElement }) → text outside the target is not highlighted", async () => {
    const target = document.createElement("section");
    document.body.appendChild(target);
    const i18n = track(base().use(inContextEditor({ targetElement: target })));

    await i18n.init();

    expect(await hoverLabel(renderText(i18n.t("hello")))).toBeNull();
  });

  it("inContextEditor({ highlightStyle }) → the Alt+hover overlay is drawn in that style", async () => {
    const highlightStyle = { borderColor: "red", backgroundColor: "pink", borderWidth: 3 };
    const i18n = track(base().use(inContextEditor({ highlightStyle })));

    await i18n.init();

    expect(await hoverOverlayStyle(renderText(i18n.t("hello")))).toEqual({
      border: "3px solid red",
      backgroundColor: "pink",
    });
  });

  it("is idempotent about discovery: an already-composed host keeps its id", () => {
    const host = attachDevtools(base(), { instanceId: "kept" }).use(plugins());
    host.setPluginData("existing", "kept");

    const again = track(host.use(inContextEditor()));

    expect({
      same: again === host,
      instanceId: host.instanceId,
      pluginData: host.getPluginData("existing"),
    }).toEqual({ same: true, instanceId: "kept", pluginData: "kept" });
  });

  it("plugin registered after the editor → its cleanup runs while the editor still highlights", async () => {
    // `use` is the caller's own capability here — the editor installer does
    // not widen the host, so the recipe composes `plugins()` explicitly.
    const i18n = base().use(plugins()).use(inContextEditor());
    let labelSeenByLaterCleanup: string | null | undefined;
    i18n.registerPlugin(() => () => {
      labelSeenByLaterCleanup = hoverLabelNow(heading);
    });
    await i18n.init();
    const heading = renderText(i18n.t("hello"));
    await flushDOMMutations();

    await i18n.destroy();

    // The installer's plugin was queued FIRST, so its cleanup runs LAST.
    expect(labelSeenByLaterCleanup).toBe("hello");
  });
});

describe("inContextEditor() wrong use — default entry", () => {
  it("registerPlugin(inContextEditor()) → init() rejects on the nested-use guard", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(inContextEditor() as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/inContextEditor\(\) is a \.use installer/);
  });

  it("registerPlugin(inContextEditor()) → the guard fires before discovery, so no instanceId", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(inContextEditor() as unknown as I18nPlugin);

    await i18n.init().catch(() => undefined);

    expect(i18n.instanceId).toBeUndefined();
  });

  it("registerPlugin(inContextEditor()) → the editor never starts on the page", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(inContextEditor() as unknown as I18nPlugin);

    await i18n.init().catch(() => undefined);

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("registerPlugin(inContextEditor()) then a failed init() → destroy() still resolves", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(inContextEditor() as unknown as I18nPlugin);
    await i18n.init().catch(() => undefined);

    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("use(inContextEditorPlugin()) → throws a TypeError", () => {
    const i18n = base();

    // `.use` is a dumb pipe: it CALLS what you give it, and the plugin needs
    // `registerPostProcessor`, which a base host does not have. Handing an
    // installer a plugin is the misuse under test, so the cast is deliberate —
    // and it has to name the host as the return type, because `.use`'s own
    // `T extends this` bound now refuses anything that is not the host.
    expect(() =>
      i18n.use(inContextEditorPlugin() as unknown as (host: typeof i18n) => typeof i18n),
    ).toThrow(TypeError);
  });

  it("use(inContextEditorPlugin()) → the editor never starts on the page", async () => {
    const i18n = base();

    try {
      i18n.use(inContextEditorPlugin() as unknown as (host: typeof i18n) => typeof i18n);
    } catch {
      // The TypeError is the previous test's claim; this one is about the page.
    }

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });
});

describe("inContextEditor() — production condition", () => {
  it("valid .use() returns the identical host and attaches nothing", () => {
    const host = base();

    const returned = host.use(prodInContextEditor({ debug: true }));

    // No discovery, no plugin host, no mappings bridge.
    expect({
      same: returned === host,
      instanceId: host.instanceId,
      registerPlugin: (host as unknown as Record<string, unknown>).registerPlugin,
      bridge: (host as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY],
      discoveryQueue: browserGlobals.__COMVI__,
    }).toEqual({
      same: true,
      instanceId: undefined,
      registerPlugin: undefined,
      bridge: undefined,
      discoveryQueue: undefined,
    });
  });

  it("valid .use() then init() → the editor never starts on the page", async () => {
    const host = track(base().use(prodInContextEditor({ debug: true })));

    await host.init();

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("wrong registerPlugin() fails at init on the return-shape guard", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin);

    // No ensure-step exists to reject it, so the identity no-op RUNS and hands
    // the host back; only nothing or a cleanup function is a legal result.
    await expect(i18n.init()).rejects.toThrow(/A plugin returned a value/);
  });

  it("wrong registerPlugin() → the failed init() leaves no instanceId behind", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin);

    await i18n.init().catch(() => undefined);

    expect(i18n.instanceId).toBeUndefined();
  });

  it("wrong registerPlugin() → the editor never starts on the page", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin);

    await i18n.init().catch(() => undefined);

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("wrong registerPlugin() → nothing was queued for teardown, destroy() resolves", async () => {
    const i18n = base().use(plugins());
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin);
    await i18n.init().catch(() => undefined);

    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("rejected optional plugin → onError is told once and init() still completes", async () => {
    const onError = vi.fn();
    const i18n = track(base().use(plugins()));
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin, {
      required: false,
      onError,
    });

    await i18n.init();

    expect({ onErrorCalls: onError.mock.calls.length, initialized: i18n.isInitialized }).toEqual({
      onErrorCalls: 1,
      initialized: true,
    });
  });

  it("rejected optional plugin → every other plugin's cleanup still runs, LIFO", async () => {
    const order: string[] = [];
    const i18n = base().use(plugins());
    i18n.registerPlugin(() => () => void order.push("first"));
    i18n.registerPlugin(prodInContextEditor() as unknown as I18nPlugin, {
      required: false,
      onError: vi.fn(),
    });
    i18n.registerPlugin(() => () => void order.push("third"));
    await i18n.init();

    await i18n.destroy();

    expect(order).toEqual(["third", "first"]);
  });

  it("production *Plugin → returns no cleanup and publishes no mappings bridge", () => {
    const i18n = createI18n({ locale: "en", defaultNs: "default", exposeGlobal: false });

    const cleanup = ProdPlugin()(asPluginHost(i18n));

    expect({
      cleanup,
      bridge: (i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY],
    }).toEqual({ cleanup: undefined, bridge: undefined });
  });

  it("production *Plugin → the editor never starts on the page", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "default", exposeGlobal: false });

    ProdPlugin()(asPluginHost(i18n));

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });
});
