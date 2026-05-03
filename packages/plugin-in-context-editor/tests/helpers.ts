/**
 * Test helper utilities
 */
import { encodeKeyToInvisible, registerKey } from "../src/translation";

/**
 * Creates a DOM element with encoded translation keys
 * @param html - HTML template string
 * @param keys - Translation keys to encode
 * @returns HTMLElement
 */
export function createTestElement(
  html: string,
  keys: Record<string, string | number> = {},
): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;

  // Replace placeholders like {{key:home.title}} with encoded invisible chars
  Object.entries(keys).forEach(([placeholder, key]) => {
    const encoded = encodeKeyToInvisible(key);
    container.innerHTML = container.innerHTML.replace(
      new RegExp(`{{key:${placeholder}}}`, "g"),
      encoded,
    );
  });

  return container.firstElementChild as HTMLElement;
}

/**
 * Creates a text node with encoded translation key
 */
export function createEncodedTextNode(key: string | number): Text {
  const encoded = encodeKeyToInvisible(key);
  return document.createTextNode(`Some text ${encoded}`);
}

/**
 * Creates an element with encoded attribute
 */
export function createEncodedAttribute(
  tagName: string,
  attrName: string,
  key: string | number,
): Element {
  const element = document.createElement(tagName);
  const encoded = encodeKeyToInvisible(key);
  element.setAttribute(attrName, `Value ${encoded}`);
  return element;
}

/**
 * Creates a scrollable container for testing scroll behavior
 */
export function createScrollableContainer(width = 200, height = 200): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.overflow = "auto";
  container.style.position = "relative";

  const content = document.createElement("div");
  content.style.width = `${width * 2}px`;
  content.style.height = `${height * 2}px`;
  container.appendChild(content);

  return container;
}

/**
 * Simulates keyboard event
 */
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

/**
 * Simulates mouse event on element
 */
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

/**
 * Gets bounding rect for testing
 */
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

/**
 * Registers multiple keys for testing
 */
export function registerTestKeys(keys: string[]): Map<string, number> {
  const mapping = new Map<string, number>();
  keys.forEach((key) => {
    const id = registerKey(key);
    mapping.set(key, id);
  });
  return mapping;
}

/**
 * Cleans up DOM after test
 */
export function cleanupDOM(): void {
  document.body.innerHTML = "";
  // Clean up any global state
  const highlights = document.querySelectorAll("[data-test-highlight]");
  highlights.forEach((el) => el.remove());
}

/**
 * Creates a spy for console methods
 */
export function spyConsole(method: "log" | "warn" | "error" = "log") {
  const original = console[method];
  const calls: any[][] = [];

  console[method] = (...args: any[]) => {
    calls.push(args);
  };

  return {
    calls,
    restore: () => {
      console[method] = original;
    },
  };
}
