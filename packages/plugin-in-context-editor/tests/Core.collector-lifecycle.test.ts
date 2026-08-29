import { beforeEach, describe, expect, it, vi } from "vitest";

const collectorCtorMock = vi.fn();
const collectorStartMock = vi.fn();
const collectorDestroyMock = vi.fn();

const domWatcherStartMock = vi.fn();
const domWatcherStopMock = vi.fn();

const registryDestroyMock = vi.fn();
const translationScannerCtorMock = vi.fn();

const callOrder: string[] = [];

vi.mock("../src/collector/Collector", () => ({
  Collector: function MockCollector(...args: unknown[]) {
    collectorCtorMock(...args);
    return {
      start: (...startArgs: unknown[]) => {
        callOrder.push("collector.start");
        return collectorStartMock(...startArgs);
      },
      destroy: (...destroyArgs: unknown[]) => {
        callOrder.push("collector.destroy");
        return collectorDestroyMock(...destroyArgs);
      },
      isDisabled: () => false,
    };
  },
}));

vi.mock("../src/DOMWatcher", () => ({
  DOMWatcher: function MockDOMWatcher() {
    return {
      start: (...args: unknown[]) => {
        callOrder.push("domWatcher.start");
        return domWatcherStartMock(...args);
      },
      stop: (...args: unknown[]) => {
        callOrder.push("domWatcher.stop");
        return domWatcherStopMock(...args);
      },
    };
  },
}));

vi.mock("../src/TranslationRegistry", () => ({
  TranslationRegistry: function MockTranslationRegistry() {
    return {
      get: vi.fn(),
      entries: () => [][Symbol.iterator](),
      destroy: (...args: unknown[]) => {
        callOrder.push("registry.destroy");
        return registryDestroyMock(...args);
      },
    };
  },
}));

vi.mock("../src/TranslationScanner", () => ({
  TranslationScanner: function MockTranslationScanner(...args: unknown[]) {
    translationScannerCtorMock(...args);
    return { destroy: vi.fn() };
  },
}));

vi.mock("../src/ElementHighlighter", () => ({
  ElementHighlighter: function MockElementHighlighter() {
    return { cleanup: vi.fn() };
  },
}));

vi.mock("../src/EditModal", () => ({ showModal: vi.fn(), cleanup: vi.fn() }));
vi.mock("../src/KeySelector", () => ({ showKeySelector: vi.fn(), cleanup: vi.fn() }));

import { Core } from "../src/Core";

describe("Core <-> Collector wiring", () => {
  beforeEach(() => {
    collectorCtorMock.mockReset();
    collectorStartMock.mockReset();
    collectorDestroyMock.mockReset();
    domWatcherStartMock.mockReset();
    domWatcherStopMock.mockReset();
    registryDestroyMock.mockReset();
    translationScannerCtorMock.mockReset();
    callOrder.length = 0;
  });

  it("constructs the Collector with the EventBus, registry, instance id, and enabled option", () => {
    const core = new Core({});
    const instanceId = core.getInstanceId();

    expect(collectorCtorMock).toHaveBeenCalledTimes(1);
    const [eventBusArg, registryArg, scopeIdArg, optionsArg] = collectorCtorMock.mock.calls[0] as [
      unknown,
      unknown,
      string,
      { enabled: boolean },
    ];
    const [scannerEventBus, scannerRegistry] = translationScannerCtorMock.mock.calls[0] as [
      unknown,
      unknown,
    ];
    expect(eventBusArg).toBe(scannerEventBus);
    expect(registryArg).toBe(scannerRegistry);
    expect(scopeIdArg).toBe(instanceId);
    expect(optionsArg).toEqual({ enabled: true });
  });

  it("honors collectContext: false", () => {
    new Core({ collectContext: false });
    const [, , , options] = collectorCtorMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { enabled: boolean },
    ];
    expect(options).toEqual({ enabled: false });
  });

  it("passes screenGroupResolver through to the Collector", () => {
    const resolver = () => "/users/:id";
    new Core({ screenGroupResolver: resolver });
    const [, , , options] = collectorCtorMock.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { screenGroupResolver?: () => string },
    ];
    expect(options.screenGroupResolver).toBe(resolver);
  });

  it("starts the collector alongside the DOM watcher", () => {
    const core = new Core({});
    core.start();

    expect(collectorStartMock).toHaveBeenCalledTimes(1);
    expect(domWatcherStartMock).toHaveBeenCalledTimes(1);
  });

  it("destroys the collector FIRST in stop() — before registry.destroy() (RC7)", () => {
    const core = new Core({});
    core.start();
    core.stop();

    // "FIRST in stop()" means ahead of the other teardown steps stop() performs,
    // not index 0 of the whole sequence — start() ran calls earlier.
    expect(callOrder).toEqual([
      "domWatcher.start",
      "collector.start",
      "collector.destroy",
      "domWatcher.stop",
      "registry.destroy",
    ]);
  });
});
