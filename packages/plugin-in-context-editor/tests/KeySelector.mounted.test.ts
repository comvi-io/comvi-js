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
import { initApiConfig, resetApiConfig, type ApiTransport } from "../src/config/api";
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

function keyResponse(value: string): Response {
  return new Response(
    JSON.stringify({
      id: 1,
      key: "home.title",
      namespaceId: 1,
      isPlural: false,
      namespace: "default",
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      translations: {
        en: {
          id: 1,
          value,
          status: "translated",
          createdAt: "2026-10-09T00:00:00.000Z",
          updatedAt: "2026-10-09T00:00:00.000Z",
          createdBy: 1,
          reviewedBy: 1,
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
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

describe("key selector previews", () => {
  it("two runtimes configured → the preview is requested through the opening runtime's scope", async () => {
    const otherRuntime = vi.fn<ApiTransport>(async () => keyResponse("From the other project"));
    const openingRuntime = vi.fn<ApiTransport>(async () => keyResponse("Hello from B"));
    initApiConfig(undefined, "core-a", { transport: otherRuntime });
    initApiConfig(undefined, "core-b", { transport: openingRuntime });
    const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-b");

    await vi.waitFor(() => expect(dropdown()?.textContent).toContain("Hello from B"));
    expect(openingRuntime).toHaveBeenCalledExactlyOnceWith("/v1/keys/default/home.title", {
      method: "GET",
    });
    expect(otherRuntime).not.toHaveBeenCalled();
  });
});
