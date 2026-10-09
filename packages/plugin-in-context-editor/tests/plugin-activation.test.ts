/**
 * When `inContextEditorPlugin` brings the editor up, read through the real
 * runtime: Alt+hover on rendered text shows the key only while it runs.
 *
 * Production guard: bundlers that ignore the "production" export condition
 * still resolve the full development entry; the factory must then return a
 * no-op plugin under NODE_ENV=production so the editor never activates.
 *
 * Runtime detection: the editor needs both `window` and `document`; a server
 * install marks translations but starts nothing. A browser bundle without a
 * `process` global is still a browser.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n, type ComposedInstance } from "./helpers/composedInstance";
import { inContextEditorPlugin } from "../src/index";
import { resetApiConfig } from "../src/config/api";
import { resetEncoder } from "../src/translation";
import { cleanupDOM } from "./helpers";
import { hoverLabel, renderMarked, renderText } from "./helpers/editorPage";

const MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";

function makeI18n(): ComposedInstance {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    exposeGlobal: false,
    messages: { "en:default": { hello: "Hello" } },
  });
}

/** Teardowns of every install a test made, run afterwards so no runtime outlives its test. */
const teardowns: Array<() => void> = [];

/**
 * The editor's install is synchronous and always hands back its teardown;
 * `I18nPlugin`'s return type also covers the async and no-cleanup shapes.
 */
function install(i18n: ComposedInstance, options?: Parameters<typeof inContextEditorPlugin>[0]) {
  const cleanup = inContextEditorPlugin(options)(asPluginHost(i18n)) as () => void;
  teardowns.push(cleanup);
  return cleanup;
}

/** Installs with the `process` global removed, as in a browser bundle without a shim. */
function installWithoutProcessGlobal(i18n: ComposedInstance): () => void {
  const nodeProcess = globalThis.process;
  // The factory reads the `process` global directly, so a bundle without a
  // `process` shim can only be staged by removing it. Not `vi.stubGlobal`:
  // that leaves it missing until the runner's own teardown, which needs
  // `process` itself. Put it back the instant the factory has run.
  Reflect.deleteProperty(globalThis, "process");
  try {
    return install(i18n);
  } finally {
    Reflect.defineProperty(globalThis, "process", {
      value: nodeProcess,
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const teardown of teardowns.splice(0)) teardown();
  cleanupDOM();
  resetApiConfig();
  resetEncoder();
});

describe("inContextEditorPlugin production guard", () => {
  it("NODE_ENV=production → marked text on the page is not highlighted", async () => {
    vi.stubEnv("NODE_ENV", "production");

    install(makeI18n());

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("NODE_ENV=production with options → marked text on the page is not highlighted", async () => {
    vi.stubEnv("NODE_ENV", "production");

    install(makeI18n(), { debug: true, collectContext: false });

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("NODE_ENV=production → the host gets no mappings bridge and no event subscription", () => {
    vi.stubEnv("NODE_ENV", "production");
    const i18n = makeI18n();
    // Subscribing to i18n events IS how the real plugin mutates the host, so
    // "no subscriptions" is the observable form of "the host is untouched".
    const onSpy = vi.spyOn(i18n, "on");

    install(i18n);

    expect({
      bridge: (i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY],
      subscriptions: onSpy.mock.calls.length,
    }).toEqual({ bridge: undefined, subscriptions: 0 });
  });

  it("NODE_ENV=production → the returned cleanup is a callable no-op", () => {
    vi.stubEnv("NODE_ENV", "production");
    const cleanup = install(makeI18n());

    expect(() => cleanup()).not.toThrow();
  });

  it("NODE_ENV=development → the host's rendered translations are highlighted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const i18n = makeI18n();

    install(i18n);

    expect(await hoverLabel(renderText(i18n.t("hello")))).toBe("hello");
  });

  it("NODE_ENV=development → the mappings bridge is published on the host", () => {
    vi.stubEnv("NODE_ENV", "development");
    const i18n = makeI18n();

    install(i18n);

    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeDefined();
  });

  it("NODE_ENV=development, cleanup → the host's rendered translations are no longer highlighted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const i18n = makeI18n();
    const cleanup = install(i18n);
    const heading = renderText(i18n.t("hello"));

    cleanup();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("NODE_ENV unset (the bundler case) → the host's rendered translations are highlighted", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    const i18n = makeI18n();

    install(i18n);

    expect(await hoverLabel(renderText(i18n.t("hello")))).toBe("hello");
  });
});

describe("inContextEditorPlugin runtime detection", () => {
  it("no window, a document present → the editor never starts on the page", async () => {
    const i18n = makeI18n();
    vi.stubGlobal("window", undefined);
    install(i18n);

    vi.unstubAllGlobals();

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("no window, a document present → install still hands back a callable teardown", () => {
    const i18n = makeI18n();
    vi.stubGlobal("window", undefined);
    const cleanup = install(i18n);

    expect(() => cleanup()).not.toThrow();
  });

  it("no document, a window present → the editor never starts on the page", async () => {
    const i18n = makeI18n();
    vi.stubGlobal("document", undefined);
    install(i18n);

    vi.unstubAllGlobals();

    expect(await hoverLabel(renderMarked("home.title"))).toBeNull();
  });

  it("no document, a window present → install still hands back a callable teardown", () => {
    const i18n = makeI18n();
    vi.stubGlobal("document", undefined);
    const cleanup = install(i18n);

    expect(() => cleanup()).not.toThrow();
  });

  it("browser bundle with no process global → the host's rendered translations are highlighted", async () => {
    const i18n = makeI18n();

    installWithoutProcessGlobal(i18n);

    expect(await hoverLabel(renderText(i18n.t("hello")))).toBe("hello");
  });
});
