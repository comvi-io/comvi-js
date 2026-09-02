/**
 * `InContextEditorPlugin`'s runtime contract on the host: the mappings bridge
 * it publishes, the SSR/browser split, which host events it subscribes to, and
 * what a teardown is obliged to give back. `Core` is a double — what the editor
 * DOES to the page is covered by the Core suites; this is the wiring around it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITOR_INITIAL_MAPPINGS_GLOBAL, readEditorMappings } from "@comvi/core/editor-bridge";
import { asPluginHost, createI18n, type ComposedHost } from "./helpers/composedHost";

const { coreCtorMock, mockCoreModule, resetCoreMocks, FIRST_MOCK_CORE_ID } = await vi.hoisted(
  () => import("./helpers/mockCore"),
);

vi.mock("../src/Core", mockCoreModule);

import { InContextEditorPlugin, type EditorOptions } from "../src/index";
import { getApiConfig, resetApiConfig } from "../src/config/api";
import { getKeyMappings, registerKey, resetEncoder } from "../src/translation";

/**
 * The editor's install runs synchronously and always hands back its teardown,
 * while `I18nPlugin`'s return type also covers the async and no-cleanup shapes
 * other plugins use. Naming the concrete shape once here keeps every
 * `cleanup?.()` below callable without re-narrowing at each site.
 */
function installEditor(options?: EditorOptions): (i18n: ComposedHost) => () => void {
  const plugin = InContextEditorPlugin(options);
  return (i18n: ComposedHost) => plugin(asPluginHost(i18n)) as () => void;
}

function makeI18n(
  overrides: { apiKey?: string; defaultNs?: string; translation?: Record<string, unknown> } = {},
): ComposedHost {
  const { defaultNs = "default", translation, ...rest } = overrides;
  return createI18n({
    locale: "en",
    defaultNs,
    exposeGlobal: false,
    translation: (translation ?? { [`en:${defaultNs}`]: { hello: "Hello" } }) as never,
    ...rest,
  });
}

/**
 * Wraps `i18n.on` so the unsubscribe handles it hands back become observable —
 * a teardown that forgets one is otherwise invisible from outside the host.
 */
function watchSubscriptions(i18n: ComposedHost) {
  const events: string[] = [];
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  const realOn = i18n.on.bind(i18n);

  vi.spyOn(i18n, "on").mockImplementation(((event: never, handler: never) => {
    events.push(event);
    const off = vi.fn(realOn(event, handler));
    unsubscribes.push(off);
    return off;
  }) as typeof i18n.on);

  return { events, unsubscribeCalls: () => unsubscribes.map((off) => off.mock.calls.length) };
}

afterEach(() => {
  resetCoreMocks();
  resetApiConfig();
  resetEncoder();
});

describe("InContextEditorPlugin mappings bridge", () => {
  it("publishes a bridge that reads and restores the encoder's key ids", () => {
    const i18n = makeI18n();

    const cleanup = installEditor()(i18n);

    const bridge = readEditorMappings(i18n);
    expect(bridge).toBeDefined();
    bridge?.loadKeyMappings({ "default:hydrated": 7 });
    expect(bridge?.getKeyMappings()).toEqual({ "default:hydrated": 7 });

    cleanup?.();
  });

  it("keeps the bridge it already published when a second runtime installs on the same host", () => {
    const i18n = makeI18n();
    const first = installEditor()(i18n);
    const published = readEditorMappings(i18n);

    const second = installEditor()(i18n);

    expect(readEditorMappings(i18n)).toBe(published);

    second?.();
    first?.();
  });

  it("withdraws the bridge when the runtime is torn down", () => {
    const i18n = makeI18n();
    const cleanup = installEditor()(i18n);

    cleanup?.();

    expect(readEditorMappings(i18n)).toBeUndefined();
  });

  it("adopts the server's key ids handed over on the host and consumes the handoff", () => {
    const i18n = makeI18n();
    (i18n as unknown as Record<string, unknown>)[EDITOR_INITIAL_MAPPINGS_GLOBAL] = {
      "default:hello": 4,
    };

    const cleanup = installEditor()(i18n);

    expect(getKeyMappings()).toEqual({ "default:hello": 4 });
    expect(
      (i18n as unknown as Record<string, unknown>)[EDITOR_INITIAL_MAPPINGS_GLOBAL],
    ).toBeUndefined();

    cleanup?.();
  });
});

describe("InContextEditorPlugin runtime detection", () => {
  it("starts no editor when there is no window, even with a document present", () => {
    const i18n = makeI18n();
    vi.stubGlobal("window", undefined);

    const cleanup = installEditor()(i18n);

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");

    cleanup?.();
  });

  it("starts no editor when there is no document, even with a window present", () => {
    const i18n = makeI18n();
    vi.stubGlobal("document", undefined);

    const cleanup = installEditor()(i18n);

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");

    cleanup?.();
  });

  it("starts the editor in a browser bundle that has no process global", () => {
    const i18n = makeI18n();
    const nodeProcess = globalThis.process;

    // The factory reads the `process` global directly, so a bundle without a
    // `process` shim can only be staged by removing it. Not `vi.stubGlobal`:
    // that leaves it missing until the runner's own teardown, which needs
    // `process` itself. Put it back the instant the factory has run.
    Reflect.deleteProperty(globalThis, "process");
    let cleanup: (() => void) | undefined;
    try {
      cleanup = installEditor()(i18n);
    } finally {
      Reflect.defineProperty(globalThis, "process", {
        value: nodeProcess,
        configurable: true,
        writable: true,
      });
    }

    expect(coreCtorMock).toHaveBeenCalledTimes(1);

    cleanup?.();
  });
});

describe("InContextEditorPlugin on a server runtime", () => {
  it("resets the encoder on install so ids stay request-scoped", () => {
    const i18n = makeI18n();
    registerKey("leftover");
    vi.stubGlobal("window", undefined);

    const cleanup = installEditor()(i18n);

    expect(getKeyMappings()).toEqual({});

    cleanup?.();
  });

  it("unsubscribes every host event it subscribed to when the runtime is torn down", () => {
    const i18n = makeI18n();
    const subscriptions = watchSubscriptions(i18n);
    vi.stubGlobal("window", undefined);

    const cleanup = installEditor()(i18n);
    cleanup?.();

    expect(subscriptions.events).toEqual(["namespaceLoaded", "localeChanged"]);
    expect(subscriptions.unsubscribeCalls()).toEqual([1, 1]);
  });

  it("stops flushing pending keys once the runtime is torn down", () => {
    const i18n = makeI18n();
    vi.stubGlobal("window", undefined);
    const cleanup = installEditor()(i18n);
    i18n.addTranslations({ "en:extra": { welcome: "Welcome" } });

    cleanup?.();
    i18n.t("hello");

    // Only the post-processor's own registration survives; the queued
    // "extra:welcome" is never flushed, so it is given no id.
    expect(getKeyMappings()).toEqual({ "default:hello": 1 });
  });
});

describe("InContextEditorPlugin key enqueueing", () => {
  it("registers the keys of a namespace loaded after install at the next translation", () => {
    const i18n = makeI18n();
    const cleanup = installEditor()(i18n);

    i18n.addTranslations({ "en:extra": { welcome: "Welcome" } });
    i18n.t("hello");

    expect(getKeyMappings()).toEqual({ "default:hello": 1, "extra:welcome": 2 });

    cleanup?.();
  });

  it("keeps every id it already assigned across a locale change", async () => {
    const i18n = makeI18n({
      translation: { "en:default": { hello: "Hello" }, "de:default": { hello: "Hallo" } },
    });
    const cleanup = installEditor()(i18n);
    i18n.t("hello");
    const beforeLocaleChange = getKeyMappings();

    await i18n.setLocaleAsync("de");
    i18n.t("hello");

    expect(getKeyMappings()).toEqual(beforeLocaleChange);

    cleanup?.();
  });

  it("assigns ids in sorted key order under a single-character namespace", () => {
    const i18n = makeI18n({
      defaultNs: "a",
      translation: { "en:a": { zebra: "Zebra", apple: "Apple" } },
    });
    const cleanup = installEditor()(i18n);

    i18n.t("zebra");

    expect(getKeyMappings()).toEqual({ "a:apple": 1, "a:zebra": 2 });

    cleanup?.();
  });

  it("keeps the ids an earlier browser runtime assigned when a later one installs", () => {
    const first = makeI18n({ translation: { "en:default": { b_key: "B", a_key: "A" } } });
    const cleanupFirst = installEditor()(first);
    first.t("a_key");
    cleanupFirst?.();

    const cleanupSecond = installEditor()(makeI18n());

    expect(getKeyMappings()).toEqual({ "default:a_key": 1, "default:b_key": 2 });

    cleanupSecond?.();
  });
});

describe("InContextEditorPlugin API configuration", () => {
  it("prefers apiKeyOverride over the host's own apiKey", () => {
    const i18n = makeI18n({ apiKey: "host-key" });

    const cleanup = installEditor({ apiKeyOverride: "override-key" })(i18n);

    expect(getApiConfig(FIRST_MOCK_CORE_ID).apiKey).toBe("override-key");

    cleanup?.();
  });

  it("falls back to the host's apiKey when no override is given", () => {
    const i18n = makeI18n({ apiKey: "host-key" });

    const cleanup = installEditor()(i18n);

    expect(getApiConfig(FIRST_MOCK_CORE_ID).apiKey).toBe("host-key");

    cleanup?.();
  });

  it("drops the runtime's API configuration when it is torn down", () => {
    const i18n = makeI18n({ apiKey: "host-key" });
    const cleanup = installEditor()(i18n);

    cleanup?.();

    expect(() => getApiConfig(FIRST_MOCK_CORE_ID)).toThrow(/API configuration not initialized/);
  });

  it("unsubscribes every host event it subscribed to when the browser runtime is torn down", () => {
    const i18n = makeI18n();
    const subscriptions = watchSubscriptions(i18n);

    const cleanup = installEditor()(i18n);
    cleanup?.();

    expect(subscriptions.events).toEqual(["namespaceLoaded", "localeChanged"]);
    expect(subscriptions.unsubscribeCalls()).toEqual([1, 1]);
  });

  it("stops flushing pending keys once the browser runtime is torn down", () => {
    const i18n = makeI18n();
    const cleanup = installEditor()(i18n);
    i18n.addTranslations({ "en:extra": { welcome: "Welcome" } });

    cleanup?.();
    i18n.t("hello");

    expect(getKeyMappings()).toEqual({ "default:hello": 1 });
  });
});
