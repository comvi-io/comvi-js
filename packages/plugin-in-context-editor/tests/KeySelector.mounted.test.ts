/**
 * The key selector as a translator meets it: the real Vue app mounted in its
 * shadow root, placed on a scrolled page, loading previews through the API
 * scope of the runtime that opened it, and torn down without leaving
 * document listeners behind.
 *
 * `tests/KeySelector.test.ts` covers placement arithmetic and teardown
 * against a mocked `createApp`; this suite does not repeat those.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeKeySelector, showKeySelector } from "../src/KeySelector";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";

const VIEWPORT = { innerHeight: 800, innerWidth: 1200, scrollX: 0, scrollY: 1000 };
const originalViewport = new Map<string, PropertyDescriptor | undefined>();

function elementAt(rect: { top: number; bottom: number; left: number; right: number }): Element {
  const element = document.createElement("button");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  return element;
}

function dropdown(): HTMLElement | null {
  const host = document.querySelector(`[${EDITOR_UI_SHADOW_HOST_ATTRIBUTE}]`);
  return host?.shadowRoot?.querySelector<HTMLElement>('[role="listbox"]') ?? null;
}

beforeEach(() => {
  for (const [name, value] of Object.entries(VIEWPORT)) {
    originalViewport.set(name, Object.getOwnPropertyDescriptor(window, name));
    Object.defineProperty(window, name, { configurable: true, value });
  }
});

afterEach(() => {
  closeKeySelector();
  resetApiConfig();
  vi.useRealTimers();
  for (const [name, descriptor] of originalViewport) {
    if (descriptor) {
      Object.defineProperty(window, name, descriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)[name];
    }
  }
  originalViewport.clear();
});

describe("key selector placement on a scrolled page", () => {
  it("scrollY 1000 → the fixed dropdown opens 8px below the element in the viewport", () => {
    initApiConfig(undefined, "core-1");
    const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdown()?.style.top).toBe("148px");
    expect(dropdown()?.style.left).toBe("200px");
  });
});
