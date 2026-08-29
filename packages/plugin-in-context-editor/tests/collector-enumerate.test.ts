import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { enumerateVisibleTargets, collectAllKeyRefs } from "../src/collector/enumerate";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";

function registerElement(
  registry: TranslationRegistry,
  element: Element,
  key: string,
  ns = "default",
): void {
  registry.add(element, {
    nodes: new Map([[document.createTextNode("x"), { key, ns }]]),
  });
}

describe("collector/enumerate", () => {
  let registry: TranslationRegistry;

  beforeEach(() => {
    registry = new TranslationRegistry(new EventBus());
  });

  afterEach(() => {
    cleanupDOM();
  });

  it("only includes elements intersecting the viewport", () => {
    const visible = document.createElement("div");
    const offscreen = document.createElement("div");
    const zeroSized = document.createElement("div");
    document.body.append(visible, offscreen, zeroSized);

    mockBoundingClientRect(visible, {
      top: 10,
      left: 10,
      width: 100,
      height: 20,
      right: 110,
      bottom: 30,
    });
    mockBoundingClientRect(offscreen, {
      top: -500,
      left: -500,
      width: 100,
      height: 20,
      right: -400,
      bottom: -480,
    });
    mockBoundingClientRect(zeroSized, {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
    });

    registerElement(registry, visible, "visible.key");
    registerElement(registry, offscreen, "offscreen.key");
    registerElement(registry, zeroSized, "zero.key");

    const targets = enumerateVisibleTargets(registry);

    expect(targets).toHaveLength(1);
    expect(targets[0]?.key).toBe("visible.key");
  });

  it("skips password inputs and contenteditable elements even when visible", () => {
    const password = document.createElement("input");
    password.type = "password";
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true, configurable: true });
    document.body.append(password, editable);

    mockBoundingClientRect(password, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    mockBoundingClientRect(editable, {
      top: 30,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 50,
    });

    registerElement(registry, password, "auth.password");
    registerElement(registry, editable, "notes.editable");

    const targets = enumerateVisibleTargets(registry);

    expect(targets).toHaveLength(0);
  });

  it("orders targets top-to-bottom then left-to-right and assigns a deterministic readingOrderIndex", () => {
    const bottomRight = document.createElement("div");
    const topLeft = document.createElement("div");
    const topRight = document.createElement("div");
    document.body.append(bottomRight, topLeft, topRight);

    mockBoundingClientRect(bottomRight, {
      top: 50,
      left: 50,
      width: 10,
      height: 10,
      right: 60,
      bottom: 60,
    });
    mockBoundingClientRect(topLeft, {
      top: 0,
      left: 0,
      width: 10,
      height: 10,
      right: 10,
      bottom: 10,
    });
    mockBoundingClientRect(topRight, {
      top: 0,
      left: 50,
      width: 10,
      height: 10,
      right: 60,
      bottom: 10,
    });

    registerElement(registry, bottomRight, "c.key");
    registerElement(registry, topLeft, "a.key");
    registerElement(registry, topRight, "b.key");

    const targets = enumerateVisibleTargets(registry);

    expect(targets.map((t) => t.key)).toEqual(["a.key", "b.key", "c.key"]);
    expect(targets.map((t) => t.readingOrderIndex)).toEqual([0, 1, 2]);
  });

  it("collectAllKeyRefs dedupes by (namespace,key) regardless of visibility", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.append(a, b);
    mockBoundingClientRect(a, {
      top: -900,
      left: 0,
      width: 10,
      height: 10,
      right: 10,
      bottom: -890,
    });
    mockBoundingClientRect(b, { top: 0, left: 0, width: 10, height: 10, right: 10, bottom: 10 });

    registerElement(registry, a, "shared.key", "ns1");
    // Same (ns,key) rendered twice in the DOM.
    registry.addOrUpdate(b, {
      nodes: new Map([
        [document.createTextNode("y"), { key: "shared.key", ns: "ns1" }],
        [document.createTextNode("z"), { key: "other.key", ns: "ns2" }],
      ]),
    });

    const refs = collectAllKeyRefs(registry);

    expect([...refs].sort((l, r) => l.key.localeCompare(r.key))).toEqual([
      { namespace: "ns2", key: "other.key" },
      { namespace: "ns1", key: "shared.key" },
    ]);
  });

  it("collectAllKeyRefs returns an empty list for an empty registry", () => {
    expect(collectAllKeyRefs(registry)).toEqual([]);
  });

  it("returns no targets when the registry is empty", () => {
    expect(enumerateVisibleTargets(registry)).toEqual([]);
  });
});
