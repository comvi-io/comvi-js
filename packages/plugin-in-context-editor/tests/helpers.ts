import { DEFAULT_HIGHLIGHT_Z_INDEX } from "../src/config/highlight";
import type { TranslationRegistry } from "../src/TranslationRegistry";

export function simulateKeyEvent(
  type: "keydown" | "keyup",
  key: string,
  options: Partial<KeyboardEventInit> = {},
): void {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
}

export function simulateMouseEvent(
  element: Element,
  type: "mouseover" | "mouseout" | "click",
  options: Partial<MouseEventInit> = {},
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    ...options,
  });
  element.dispatchEvent(event);
}

export function mockBoundingClientRect(element: Element, rect: Partial<DOMRect>): void {
  const defaultRect: DOMRect = {
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    top: 0,
    right: 100,
    bottom: 50,
    left: 0,
    toJSON: () => ({}),
  };

  element.getBoundingClientRect = () => ({ ...defaultRect, ...rect });
}

export function cleanupDOM(): void {
  document.body.innerHTML = "";
  const highlights = document.querySelectorAll("[data-test-highlight]");
  highlights.forEach((el) => el.remove());
}

/**
 * The package's single deterministic flush: one macrotask, one animation
 * frame, one more macrotask — enough for a MutationObserver callback plus the
 * scanner's own rAF work. Not a sleep (the 0 delay yields, it does not wait).
 */
export async function flushDOMMutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Yields for exactly one animation frame — the beat a rAF-deferred style flip lands on. */
export async function flushAnimationFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Drains the microtask queue so fire-and-forget promise chains settle. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const VISIBLE_RECT: Partial<DOMRect> = {
  top: 0,
  left: 0,
  width: 100,
  height: 20,
  right: 100,
  bottom: 20,
};

/**
 * Attaches a registered, on-screen element the collector will enumerate.
 * `rect` overrides the default in-viewport 100×20 box.
 */
export function registerVisible(
  registry: TranslationRegistry,
  key: string,
  rect: Partial<DOMRect> = VISIBLE_RECT,
): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  mockBoundingClientRect(el, rect);
  registry.add(el, { nodes: new Map([[document.createTextNode("x"), { key, ns: "ns" }]]) });
  return el;
}

/**
 * The highlight overlay currently in the document, located by the style
 * signature `createHighlightOverlay()` writes. `zIndex` must match the
 * highlighter's configured z-index.
 */
export function getActiveOverlay(
  zIndex: number = DEFAULT_HIGHLIGHT_Z_INDEX,
): HTMLDivElement | null {
  const overlay = Array.from(document.body.querySelectorAll("div")).find(
    (node) =>
      node.style.position === "absolute" &&
      node.style.pointerEvents === "none" &&
      node.style.zIndex === String(zIndex),
  );
  return (overlay as HTMLDivElement | undefined) ?? null;
}

/** The key tooltip currently in the document, located by its style signature. */
export function getActiveTooltip(): HTMLDivElement | null {
  const tooltip = Array.from(document.body.querySelectorAll("div")).find(
    (node) =>
      node.style.position === "absolute" &&
      node.style.fontSize === "11px" &&
      node.style.pointerEvents === "none" &&
      node.style.whiteSpace === "nowrap",
  );
  return (tooltip as HTMLDivElement | undefined) ?? null;
}
