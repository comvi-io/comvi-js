import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import {
  enumerateVisibleTargets,
  collectAllKeyRefs,
  collectKeyRefsForElements,
} from "../src/collector/enumerate";
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

  describe("viewport intersection boundaries", () => {
    // Pinned so the < / > edges below are exact rather than happy-dom defaults.
    beforeEach(() => {
      vi.stubGlobal("innerWidth", 400);
      vi.stubGlobal("innerHeight", 300);
    });

    function measure(rect: Partial<DOMRect>): number {
      const element = document.createElement("div");
      document.body.appendChild(element);
      mockBoundingClientRect(element, rect);
      registerElement(registry, element, "probe.key");

      return enumerateVisibleTargets(registry).length;
    }

    it.each([
      [
        "a rect fully inside the viewport is measured",
        { top: 10, left: 10, width: 100, height: 20, right: 110, bottom: 30 },
        1,
      ],
      [
        "a rect whose bottom edge sits exactly on the viewport top is dropped",
        { top: -20, left: 10, width: 100, height: 20, right: 110, bottom: 0 },
        0,
      ],
      [
        "a rect showing one pixel of its bottom edge is measured",
        { top: -19, left: 10, width: 100, height: 20, right: 110, bottom: 1 },
        1,
      ],
      [
        "a rect whose right edge sits exactly on the viewport left is dropped",
        { top: 10, left: -100, width: 100, height: 20, right: 0, bottom: 30 },
        0,
      ],
      [
        "a rect showing one pixel of its right edge is measured",
        { top: 10, left: -99, width: 100, height: 20, right: 1, bottom: 30 },
        1,
      ],
      [
        "a rect whose top sits exactly on the viewport height is dropped",
        { top: 300, left: 10, width: 100, height: 20, right: 110, bottom: 320 },
        0,
      ],
      [
        "a rect whose top is one pixel above the viewport height is measured",
        { top: 299, left: 10, width: 100, height: 20, right: 110, bottom: 319 },
        1,
      ],
      [
        "a rect whose left sits exactly on the viewport width is dropped",
        { top: 10, left: 400, width: 100, height: 20, right: 500, bottom: 30 },
        0,
      ],
      [
        "a rect whose left is one pixel inside the viewport width is measured",
        { top: 10, left: 399, width: 100, height: 20, right: 499, bottom: 30 },
        1,
      ],
      [
        "a rect entirely above the viewport but horizontally in range is dropped",
        { top: -40, left: 10, width: 100, height: 20, right: 110, bottom: -20 },
        0,
      ],
      [
        "a rect entirely below the viewport is dropped",
        { top: 2000, left: 10, width: 100, height: 20, right: 110, bottom: 2020 },
        0,
      ],
      [
        "a rect entirely left of the viewport is dropped",
        { top: 10, left: -200, width: 100, height: 20, right: -100, bottom: 30 },
        0,
      ],
    ])("%s", (_label, rect, expected) => {
      expect(measure(rect)).toBe(expected);
    });
  });

  it.each([
    ["skips a fully collapsed 0x0 box at an on-screen position", { width: 0, height: 0 }, 0],
    ["measures a zero-height box that still has width", { width: 100, height: 0 }, 1],
    ["measures a zero-width box that still has height", { width: 0, height: 20 }, 1],
  ])("%s", (_label, size, expected) => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    mockBoundingClientRect(element, {
      top: 10,
      left: 10,
      right: 10 + size.width,
      bottom: 10 + size.height,
      ...size,
    });
    registerElement(registry, element, "probe.key");

    expect(enumerateVisibleTargets(registry)).toHaveLength(expected);
  });

  it("includes a visible non-password input (only password fields are sensitive)", () => {
    const text = document.createElement("input");
    text.type = "text";
    document.body.appendChild(text);
    mockBoundingClientRect(text, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });
    registerElement(registry, text, "search.query");

    expect(enumerateVisibleTargets(registry).map((t) => t.key)).toEqual(["search.query"]);
  });

  it("reports the geometric center of each target's rect", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    mockBoundingClientRect(element, {
      top: 10,
      left: 20,
      width: 100,
      height: 40,
      right: 120,
      bottom: 50,
    });
    registerElement(registry, element, "centered.key");

    expect(enumerateVisibleTargets(registry)[0]?.centerPoint).toEqual({ x: 70, y: 30 });
  });

  it("orders two targets sharing a top edge by their left edge", () => {
    const right = document.createElement("div");
    const left = document.createElement("div");
    document.body.append(right, left);
    mockBoundingClientRect(right, {
      top: 5,
      left: 80,
      width: 10,
      height: 10,
      right: 90,
      bottom: 15,
    });
    mockBoundingClientRect(left, {
      top: 5,
      left: 10,
      width: 10,
      height: 10,
      right: 20,
      bottom: 15,
    });

    registerElement(registry, right, "right.key");
    registerElement(registry, left, "left.key");

    expect(enumerateVisibleTargets(registry).map((t) => t.key)).toEqual(["left.key", "right.key"]);
  });

  it("skips an element in the visible set that is no longer in the registry", () => {
    const stale = document.createElement("div");
    document.body.appendChild(stale);
    mockBoundingClientRect(stale, {
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
    });

    expect(enumerateVisibleTargets(registry, new Set<Element>([stale]))).toEqual([]);
  });

  it("collectAllKeyRefs keeps (ns 'a', key 'bc') and (ns 'ab', key 'c') apart", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    registry.add(element, {
      nodes: new Map([
        [document.createTextNode("1"), { key: "bc", ns: "a" }],
        [document.createTextNode("2"), { key: "c", ns: "ab" }],
      ]),
    });

    expect(collectAllKeyRefs(registry)).toEqual([
      { namespace: "a", key: "bc" },
      { namespace: "ab", key: "c" },
    ]);
  });

  describe("collectKeyRefsForElements", () => {
    it("dedupes the same (namespace,key) rendered on two elements in the set", () => {
      const first = document.createElement("div");
      const second = document.createElement("div");
      document.body.append(first, second);
      registerElement(registry, first, "shared.key", "ns1");
      registerElement(registry, second, "shared.key", "ns1");

      const refs = collectKeyRefsForElements(registry, new Set<Element>([first, second]));

      expect(refs).toEqual([{ namespace: "ns1", key: "shared.key" }]);
    });

    it("keeps (ns 'a', key 'bc') and (ns 'ab', key 'c') apart", () => {
      const element = document.createElement("div");
      document.body.appendChild(element);
      registry.add(element, {
        nodes: new Map([
          [document.createTextNode("1"), { key: "bc", ns: "a" }],
          [document.createTextNode("2"), { key: "c", ns: "ab" }],
        ]),
      });

      expect(collectKeyRefsForElements(registry, new Set<Element>([element]))).toEqual([
        { namespace: "a", key: "bc" },
        { namespace: "ab", key: "c" },
      ]);
    });

    it("skips an element that is no longer in the registry", () => {
      const present = document.createElement("div");
      const stale = document.createElement("div");
      document.body.append(present, stale);
      registerElement(registry, present, "present.key", "ns");

      const refs = collectKeyRefsForElements(registry, new Set<Element>([present, stale]));

      expect(refs).toEqual([{ namespace: "ns", key: "present.key" }]);
    });
  });

  it("collectAllKeyRefs returns an empty list for an empty registry", () => {
    expect(collectAllKeyRefs(registry)).toEqual([]);
  });

  it("returns no targets when the registry is empty", () => {
    expect(enumerateVisibleTargets(registry)).toEqual([]);
  });
});
