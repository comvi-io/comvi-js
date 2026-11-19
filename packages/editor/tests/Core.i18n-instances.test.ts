import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The instance registry is module state shared by every Core; the collaborators
// are stubbed so a Core can be built and torn down without touching the DOM.
vi.mock("../src/DOMWatcher", () => ({
  DOMWatcher: function MockDOMWatcher() {
    return { start: () => {}, stop: () => {} };
  },
}));

vi.mock("../src/TranslationRegistry", () => ({
  TranslationRegistry: function MockTranslationRegistry() {
    return { get: () => undefined, destroy: () => {} };
  },
}));

vi.mock("../src/TranslationScanner", () => ({
  TranslationScanner: function MockTranslationScanner() {
    return { destroy: () => {} };
  },
}));

vi.mock("../src/ElementHighlighter", () => ({
  ElementHighlighter: function MockElementHighlighter() {
    return { cleanup: () => {} };
  },
}));

vi.mock("../src/EventBus", () => ({
  EventBus: function MockEventBus() {
    return { removeAllListeners: () => {} };
  },
}));

vi.mock("../src/collector/Collector", () => ({
  Collector: function MockCollector() {
    return { start: () => Promise.resolve(), destroy: () => {} };
  },
}));

import { Core, getI18nInstance, type EditorI18n } from "../src/Core";

const HOST_A = { apiKey: "host-a" } as unknown as EditorI18n;
const HOST_B = { apiKey: "host-b" } as unknown as EditorI18n;

describe("Core i18n instance registry", () => {
  let cores: Core[];

  beforeEach(() => {
    cores = [];
  });

  afterEach(() => {
    cores.splice(0).forEach((core) => core.stop());
  });

  function createCore(i18n?: EditorI18n): Core {
    const core = new Core({}, i18n);
    cores.push(core);
    return core;
  }

  it("returns the host each Core registered under its own instance id", () => {
    const first = createCore(HOST_A);
    const second = createCore(HOST_B);

    expect([
      getI18nInstance(first.getInstanceId()),
      getI18nInstance(second.getInstanceId()),
    ]).toEqual([HOST_A, HOST_B]);
  });

  it("returns null for an instance id no Core registered", () => {
    createCore(HOST_A);

    expect(getI18nInstance("core-never-created")).toBeNull();
  });

  it("returns the first registered host when called without an instance id", () => {
    createCore(HOST_A);
    createCore(HOST_B);

    expect(getI18nInstance()).toBe(HOST_A);
  });

  it("returns null when no Core has registered a host", () => {
    expect(getI18nInstance()).toBeNull();
  });

  it("leaves the default slot free for a Core constructed without a host", () => {
    createCore();
    createCore(HOST_A);

    expect(getI18nInstance()).toBe(HOST_A);
  });

  it("releases the instance id on stop()", () => {
    const core = new Core({}, HOST_A);
    const instanceId = core.getInstanceId();

    core.stop();

    expect(getI18nInstance(instanceId)).toBeNull();
  });

  it("gives every Core a distinct instance id", () => {
    const first = createCore(HOST_A);
    const second = createCore(HOST_B);

    expect(first.getInstanceId()).not.toBe(second.getInstanceId());
  });

  it("names the instance id core-<counter>", () => {
    const core = createCore(HOST_A);

    expect(core.getInstanceId()).toMatch(/^core-\d+$/);
  });
});
