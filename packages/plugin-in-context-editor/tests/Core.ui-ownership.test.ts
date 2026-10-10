/**
 * The modal and the key selector are page-level singletons shared by every
 * `Core` on the page. Stopping one Core must leave UI that another, still
 * active Core opened. The real `EditModal`/`KeySelector` modules run here over
 * a mocked `createApp`, so "torn down" is observable as an unmount.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(),
  unmount: vi.fn(),
  registryGet: vi.fn(),
  clickHandlers: [] as Array<(element: Element) => void>,
}));

vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  createApp: mocks.createApp,
}));
vi.mock("../src/utils/shadowDom", () => ({
  createShadowDomContainer: () => ({
    container: document.createElement("div"),
    mountPoint: document.createElement("div"),
  }),
}));
vi.mock("../src/App.vue", () => ({ default: { name: "AppStub", render: () => null } }));
vi.mock("../src/KeySelectorApp.vue", () => ({
  default: { name: "KeySelectorAppStub", render: () => null },
}));
vi.mock("../src/DOMWatcher", () => ({
  DOMWatcher: function MockDOMWatcher() {
    return { start: vi.fn(), stop: vi.fn() };
  },
}));
vi.mock("../src/TranslationRegistry", () => ({
  TranslationRegistry: function MockTranslationRegistry() {
    return { get: mocks.registryGet, destroy: vi.fn() };
  },
}));
vi.mock("../src/TranslationScanner", () => ({
  TranslationScanner: function MockTranslationScanner() {
    return { destroy: vi.fn() };
  },
}));
vi.mock("../src/ElementHighlighter", () => ({
  ElementHighlighter: function MockElementHighlighter(_bus: unknown, onClick: never) {
    mocks.clickHandlers.push(onClick);
    return { cleanup: vi.fn() };
  },
}));
vi.mock("../src/EventBus", () => ({
  EventBus: function MockEventBus() {
    return { removeAllListeners: vi.fn() };
  },
}));
vi.mock("../src/collector/Collector", () => ({
  Collector: function MockCollector() {
    return { start: vi.fn(), destroy: vi.fn() };
  },
}));

import { Core, type EditorI18n } from "../src/Core";

// The editor UI is a lazy import. `vi.waitFor` gives up after 1 s by default,
// which a cold module transform on a busy runner can exceed.
const UI_IMPORT_TIMEOUT = { timeout: 10_000 };

const HOST = { getDefaultNamespace: () => "default" } as unknown as EditorI18n;

/** The reactive props `createApp` received on its `index`-th call. */
const appProps = (index: number) =>
  mocks.createApp.mock.calls[index]![1] as {
    open: { value: boolean };
    translationInstanceId?: { value: string | undefined };
  };

beforeEach(() => {
  mocks.createApp.mockReset();
  mocks.unmount.mockReset();
  mocks.registryGet.mockReset();
  mocks.clickHandlers.length = 0;
  mocks.createApp.mockImplementation(() => ({ mount: vi.fn(), unmount: mocks.unmount }));
});

describe("Core: editor UI owned by another active Core", () => {
  it("keeps the modal Core B opened when Core A stops", async () => {
    const coreA = new Core({}, HOST);
    const coreB = new Core({}, HOST);
    coreA.start();
    coreB.start();
    mocks.registryGet.mockReturnValue({
      nodes: new Map([[document.createTextNode("x"), { key: "home.title", ns: "default" }]]),
    });

    mocks.clickHandlers[1]!(document.createElement("div"));
    await vi.waitFor(() => expect(mocks.createApp).toHaveBeenCalled(), UI_IMPORT_TIMEOUT);
    coreA.stop();

    expect(mocks.unmount).not.toHaveBeenCalled();
    expect(appProps(0).open.value).toBe(true);
    expect(appProps(0).translationInstanceId!.value).toBe(coreB.getInstanceId());

    coreB.stop();
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
  });

  it("keeps the key selector Core B opened when Core A stops", async () => {
    const coreA = new Core({}, HOST);
    const coreB = new Core({}, HOST);
    coreA.start();
    coreB.start();
    mocks.registryGet.mockReturnValue({
      nodes: new Map([
        [document.createTextNode("a"), { key: "home.title", ns: "default" }],
        [document.createTextNode("b"), { key: "checkout.total", ns: "checkout" }],
      ]),
    });

    mocks.clickHandlers[1]!(document.createElement("div"));
    await vi.waitFor(() => expect(mocks.createApp).toHaveBeenCalled(), UI_IMPORT_TIMEOUT);
    coreA.stop();

    expect(mocks.unmount).not.toHaveBeenCalled();
    expect(appProps(0).open.value).toBe(true);

    coreB.stop();
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
  });
});
