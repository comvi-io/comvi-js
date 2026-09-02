/**
 * The lowercase installer, under BOTH export conditions.
 *
 * Default entry: `inContextEditor(options)` ensures discovery and the plugin
 * host, then routes into `use` — it re-implements no lifecycle.
 * `production` entry: the same name and the same type, but the body is
 * `(host) => host` — no discovery, no capability, no plugin.
 *
 * The two wrong-use MECHANISMS are both proved here, because this package is
 * the only one that ships both. `.use(inContextEditor(…))` on the default
 * entry hits the nested-use guard at the first ensure-step; on the production
 * entry there is no ensure-step to hit, so the identity no-op runs and the
 * plugin host's return-shape guard rejects the host it handed back.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDevtools } from "@comvi/core/devtools";
import { plugins } from "@comvi/core/plugins";
import type { I18nPlugin } from "@comvi/core";
import { asPluginHost, createI18n } from "./helpers/composedHost";
import { createI18n as createBaseI18n } from "@comvi/core";

const { coreCtorMock, coreStartMock, coreStopMock, mockCoreModule, resetCoreMocks } =
  await vi.hoisted(() => import("./helpers/mockCore"));

vi.mock("../src/Core", mockCoreModule);

import { InContextEditorPlugin, inContextEditor } from "../src/index";
import {
  InContextEditorPlugin as ProdPlugin,
  inContextEditor as prodInContextEditor,
} from "../src/entry-production";

const MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";

const base = () => createBaseI18n({ locale: "en", defaultNs: "default", exposeGlobal: false });

/** The discovery queue the devtools capability publishes onto. */
const browserGlobals = globalThis as Record<string, unknown>;

afterEach(() => {
  resetCoreMocks();
  delete browserGlobals.__COMVI__;
});

describe("inContextEditor() installer — default entry", () => {
  it("ensures discovery and the plugin host, starts the editor at init() and stops it at destroy()", async () => {
    const i18n = base().with(inContextEditor());

    // Discovery came FIRST, and the plugin host is composed on.
    expect(i18n.instanceId).toBeDefined();
    expect(typeof (i18n as unknown as Record<string, unknown>).use).toBe("function");
    // Composition attaches; the PLUGIN runs at init().
    expect(coreCtorMock).not.toHaveBeenCalled();

    await i18n.init();

    expect(coreCtorMock).toHaveBeenCalledTimes(1);
    expect(coreStartMock).toHaveBeenCalledTimes(1);
    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeDefined();

    await i18n.destroy();
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });

  it("hands the host back unchanged — the widening is deliberately none", () => {
    const host = base();

    expect(host.with(inContextEditor())).toBe(host);
  });

  it("passes options through to the plugin factory", async () => {
    const target = document.createElement("div");
    const i18n = base().with(inContextEditor({ targetElement: target, debug: true }));

    await i18n.init();

    expect(coreCtorMock).toHaveBeenCalledWith(
      {
        targetElement: target,
        tagAttributes: undefined,
        debug: true,
        highlightStyle: undefined,
        collectContext: undefined,
        screenGroupResolver: undefined,
      },
      i18n,
    );
    await i18n.destroy();
  });

  it("is idempotent about discovery: an already-composed host keeps its id", async () => {
    const host = attachDevtools(base(), { instanceId: "kept" }).with(plugins());
    host.setPluginData("existing", "kept");

    const again = host.with(inContextEditor());

    expect(again).toBe(host);
    expect(host.instanceId).toBe("kept");
    expect(host.getPluginData("existing")).toBe("kept");

    await host.init();
    await host.destroy();
  });

  it("keeps the plugin's cleanup on the host's LIFO teardown", async () => {
    const order: string[] = [];
    // `use` is the caller's own capability here — the editor installer does
    // not widen the host, so the recipe composes `plugins()` explicitly.
    const i18n = base().with(plugins()).with(inContextEditor());
    coreStopMock.mockImplementation(() => void order.push("editor"));

    i18n.use(() => () => void order.push("after"));

    await i18n.init();
    await i18n.destroy();

    // The installer's plugin was queued FIRST, so its cleanup runs LAST.
    expect(order).toEqual(["after", "editor"]);
  });
});

describe("inContextEditor() wrong use — default entry", () => {
  it("fails at init on the first ensure-step, before discovery or attachment", async () => {
    const i18n = base().with(plugins());
    i18n.use(inContextEditor() as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/inContextEditor\(\) is a \.with\(…\) installer/);

    // The guard ran BEFORE attachDevtools, so no discovery happened…
    expect(i18n.instanceId).toBeUndefined();
    // …and the editor never started.
    expect(coreCtorMock).not.toHaveBeenCalled();
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("rejects the uppercase factory handed to .with()", () => {
    const i18n = base();

    // `.with` is a dumb pipe: it CALLS what you give it, and the plugin needs
    // `registerPostProcessor`, which a base host does not have. Handing an
    // installer a plugin is the misuse under test, so the cast is deliberate.
    expect(() =>
      i18n.with(InContextEditorPlugin() as unknown as (host: typeof i18n) => unknown),
    ).toThrow(TypeError);
    expect(coreStartMock).not.toHaveBeenCalled();
  });
});

describe("inContextEditor() — production condition", () => {
  it("valid .with() returns the identical host and attaches nothing", async () => {
    const host = base();

    const returned = host.with(prodInContextEditor({ debug: true }));

    expect(returned).toBe(host);
    // No discovery, no plugin host, no editor, no mappings bridge.
    expect(host.instanceId).toBeUndefined();
    expect((host as unknown as Record<string, unknown>).use).toBeUndefined();
    expect((host as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeUndefined();
    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(browserGlobals.__COMVI__).toBeUndefined();

    await returned.init();
    expect(coreStartMock).not.toHaveBeenCalled();
  });

  it("wrong .use() fails at init on the return-shape guard, mutating nothing", async () => {
    const i18n = base().with(plugins());
    i18n.use(prodInContextEditor() as unknown as I18nPlugin);

    // No ensure-step exists to reject it, so the identity no-op RUNS and hands
    // the host back; only nothing or a cleanup function is a legal result.
    await expect(i18n.init()).rejects.toThrow(/A plugin returned a value/);

    expect(i18n.instanceId).toBeUndefined();
    expect(coreCtorMock).not.toHaveBeenCalled();
    // Nothing was queued for teardown by the rejected plugin.
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("keeps every other plugin's cleanup intact around the rejection", async () => {
    const order: string[] = [];
    const onError = vi.fn();
    const i18n = base().with(plugins());

    i18n.use(() => () => void order.push("first"));
    i18n.use(prodInContextEditor() as unknown as I18nPlugin, { required: false, onError });
    i18n.use(() => () => void order.push("third"));

    await i18n.init();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(i18n.isInitialized).toBe(true);

    await i18n.destroy();
    expect(order).toEqual(["third", "first"]);
  });

  it("keeps the uppercase production no-op unchanged", () => {
    const i18n = createI18n({ locale: "en", defaultNs: "default" });

    const cleanup = ProdPlugin()(asPluginHost(i18n));

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(cleanup).toBeUndefined();
    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeUndefined();
  });
});
