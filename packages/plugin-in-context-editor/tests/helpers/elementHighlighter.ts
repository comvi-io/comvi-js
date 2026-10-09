/**
 * Shared fixture for the ElementHighlighter suites: a highlighter on its own
 * event bus with a recorded click handler, plus the page-level stubs those
 * suites need (scroll offsets, element boxes, key registration on the bus).
 */
import { vi, type Mock } from "vitest";
import { ElementHighlighter } from "../../src/ElementHighlighter";
import { EventBus } from "../../src/EventBus";
import type { NodeData } from "../../src/types/translation";
import { mockBoundingClientRect } from "../helpers";

export type HighlighterFixture = {
  highlighter: ElementHighlighter;
  handleClick: Mock<(element: Element) => void>;
  eventBus: EventBus;
};

export function createHighlighterFixture(): HighlighterFixture {
  const handleClick = vi.fn<(element: Element) => void>();
  const eventBus = new EventBus();
  const highlighter = new ElementHighlighter(eventBus, handleClick);
  return { highlighter, handleClick, eventBus };
}

const scrollDescriptors = {
  x: Object.getOwnPropertyDescriptor(window, "scrollX"),
  y: Object.getOwnPropertyDescriptor(window, "scrollY"),
};

export function stubPageScroll(x: number, y: number): void {
  Object.defineProperty(window, "scrollX", { value: x, configurable: true });
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

export function restorePageScroll(): void {
  for (const [axis, descriptor] of [
    ["scrollX", scrollDescriptors.x],
    ["scrollY", scrollDescriptors.y],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(window, axis, descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)[axis];
    }
  }
}

export function appendElement(rect: Partial<DOMRect>, tagName = "button"): HTMLElement {
  const element = document.createElement(tagName);
  mockBoundingClientRect(element, rect);
  document.body.appendChild(element);
  return element;
}

/** Announces `element` as translated with `keys`, the way the registry would. */
export function registerKeysOn(
  eventBus: EventBus,
  element: Element,
  keys: Array<{ key: string; ns?: string }>,
): void {
  // `NodeData.ns` is a required string, and the highlighter reads a falsy one
  // as "no namespace", so an omitted namespace stands in as the empty string.
  const nodes = new Map<Node | Attr, NodeData>(
    keys.map((entry) => [
      document.createTextNode(entry.key),
      { key: entry.key, ns: entry.ns ?? "" },
    ]),
  );
  eventBus.emit("translationRegistered", element, { nodes });
}
