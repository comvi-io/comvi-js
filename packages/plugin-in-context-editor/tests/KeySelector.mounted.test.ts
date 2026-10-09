/**
 * The key selector as a translator meets it: the real Vue app mounted in its
 * shadow root, placed on a scrolled page, loading previews through the API
 * scope of the runtime that opened it, and torn down without leaving
 * document listeners behind.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, closeKeySelector, showKeySelector } from "../src/KeySelector";
import { initApiConfig, resetApiConfig, type ApiTransport } from "../src/config/api";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";

// Scrolled on both axes: the dropdown is `position: fixed`, so neither offset may leak into it.
const VIEWPORT = { innerHeight: 800, innerWidth: 1200, scrollX: 300, scrollY: 1000 };
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

function selectorHosts(): Element[] {
  return Array.from(document.querySelectorAll(`[${EDITOR_UI_SHADOW_HOST_ATTRIBUTE}]`));
}

function dropdown(): HTMLElement | null {
  const host = selectorHosts()[0];
  return host?.shadowRoot?.querySelector<HTMLElement>('[role="listbox"]') ?? null;
}

/** Where the dropdown sits, in viewport pixels. */
function dropdownPosition(): { top: string | undefined; left: string | undefined } {
  return { top: dropdown()?.style.top, left: dropdown()?.style.left };
}

/** The options as the translator reads them: key, then the namespace when it is not the default. */
function optionLabels(): string[] {
  return Array.from(dropdown()?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).map(
    (option) => option.querySelector(".font-mono")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

function clickOption(index: number): void {
  dropdown()!.querySelectorAll<HTMLElement>('[role="option"]')[index]!.click();
}

/** Opens a selector for `keys` against an element in the top-left of the viewport. */
function openSelector(
  keys: Array<{ key: string; ns: string; textPreview?: string }>,
  onSelect: (key: string, ns: string) => void = vi.fn(),
): void {
  showKeySelector(
    keys,
    elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
    onSelect,
    "default",
    "core-1",
  );
}

/** The dropdown arms its outside-click and Escape listeners one macrotask after mounting. */
async function waitForDismissListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  beforeEach(() => initApiConfig(undefined, "core-1"));

  it("element near the bottom-right corner → the dropdown is flipped above and clamped to the 16px margin", () => {
    // Flipped above (bottom 790 + 300 > 800), then floored at 16px; left is
    // viewport 1200 − dropdown 400 − 16px margin.
    const element = elementAt({ top: 10, right: 1190, bottom: 790, left: 1100 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdownPosition()).toEqual({
      top: "16px",
      left: "784px",
    });
  });

  it("element whose dropdown would overflow the bottom edge → the dropdown opens 8px above it", () => {
    const element = elementAt({ top: 400, right: 300, bottom: 600, left: 200 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    // Element top 400 − dropdown 300 − the 8px gap; left stays on the element.
    expect(dropdownPosition()).toEqual({ top: "92px", left: "200px" });
  });

  it("dropdown that fits the viewport bottom exactly → it stays below the element", () => {
    const element = elementAt({ top: 460, right: 300, bottom: 500, left: 200 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdownPosition()).toEqual({ top: "508px", left: "200px" });
  });

  it("element starting left of the viewport → the dropdown is clamped to the 16px left margin", () => {
    const element = elementAt({ top: 100, right: 60, bottom: 140, left: -40 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdownPosition()).toEqual({ top: "148px", left: "16px" });
  });

  it("dropdown that reaches the right edge exactly → it stays aligned with the element", () => {
    const element = elementAt({ top: 100, right: 900, bottom: 140, left: 800 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdownPosition()).toEqual({ top: "148px", left: "800px" });
  });

  it("page scrolled by (300, 1000) → the fixed dropdown opens 8px below the element in viewport coordinates", () => {
    const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });

    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    expect(dropdownPosition()).toEqual({ top: "148px", left: "200px" });
  });
});

describe("key selector options", () => {
  beforeEach(() => initApiConfig(undefined, "core-1"));

  it("keys from the default and another namespace → only the other key is labelled with its namespace", () => {
    openSelector([
      { key: "home.title", ns: "default" },
      { key: "checkout.total", ns: "checkout" },
    ]);

    expect(optionLabels()).toEqual(["home.title", "checkout.total (checkout)"]);
  });

  it("empty key list → the dropdown opens with no options", () => {
    openSelector([]);

    expect({ open: dropdown() !== null, options: optionLabels() }).toEqual({
      open: true,
      options: [],
    });
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

describe("key selector page text", () => {
  it("element text differs from the stored translation → the option shows the page text and the stored value", async () => {
    const transport = vi.fn<ApiTransport>(async () => keyResponse("Welcome to the shop"));
    initApiConfig(undefined, "core-1", { transport });
    const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });

    showKeySelector(
      [{ key: "home.title", ns: "default", textPreview: "Welcome back" }],
      element,
      vi.fn(),
      "default",
      "core-1",
    );

    await vi.waitFor(() => expect(dropdown()?.textContent).toContain("Welcome to the shop"));
    expect(dropdown()?.querySelector('[role="option"]')?.textContent).toContain(
      'Text: "Welcome back"',
    );
  });
});

describe("key selector choice", () => {
  beforeEach(() => initApiConfig(undefined, "core-1"));

  it("option clicked → the caller receives its key and namespace", () => {
    const onSelect = vi.fn();
    openSelector(
      [
        { key: "home.title", ns: "default" },
        { key: "checkout.total", ns: "checkout" },
      ],
      onSelect,
    );

    clickOption(1);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("checkout.total", "checkout");
  });

  it("option clicked → the selector leaves the page", () => {
    openSelector([{ key: "home.title", ns: "default" }]);

    clickOption(0);

    expect(selectorHosts()).toEqual([]);
  });

  it("closeKeySelector() after a choice → nothing is left to tear down and Vue warns about nothing", () => {
    const warn = vi.spyOn(console, "warn");
    openSelector([{ key: "home.title", ns: "default" }]);
    clickOption(0);

    closeKeySelector();

    expect({ hosts: selectorHosts(), warnings: warn.mock.calls }).toEqual({
      hosts: [],
      warnings: [],
    });
  });
});

describe("key selector teardown", () => {
  beforeEach(() => initApiConfig(undefined, "core-1"));

  it("Escape pressed → the selector leaves the page", async () => {
    openSelector([{ key: "home.title", ns: "default" }]);
    await waitForDismissListeners();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(selectorHosts()).toEqual([]);
  });

  it("mousedown outside the dropdown → the selector leaves the page", async () => {
    openSelector([{ key: "home.title", ns: "default" }]);
    await waitForDismissListeners();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));

    expect(selectorHosts()).toEqual([]);
  });

  it("mousedown inside the dropdown → the selector stays open", async () => {
    openSelector([{ key: "home.title", ns: "default" }]);
    await waitForDismissListeners();

    dropdown()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));

    expect(selectorHosts()).toHaveLength(1);
  });

  it("cleanup() by the runtime that opened it → the selector leaves the page", () => {
    openSelector([{ key: "home.title", ns: "default" }]);

    cleanup("core-1");

    expect(selectorHosts()).toEqual([]);
  });

  it("cleanup() by another runtime → the selector stays on the page", () => {
    openSelector([{ key: "home.title", ns: "default" }]);

    cleanup("core-2");

    expect(selectorHosts()).toHaveLength(1);
  });

  it("closeKeySelector() → the selector leaves the page", () => {
    openSelector([{ key: "home.title", ns: "default" }]);

    closeKeySelector();

    expect(selectorHosts()).toEqual([]);
  });

  it("second showKeySelector() → one selector on the page, offering the second call's keys", () => {
    openSelector([{ key: "home.title", ns: "default" }]);

    openSelector([{ key: "checkout.total", ns: "checkout" }]);

    expect({ hosts: selectorHosts().length, options: optionLabels() }).toEqual({
      hosts: 1,
      options: ["checkout.total (checkout)"],
    });
  });

  it("closed before its listeners were installed → no document listener is left behind", () => {
    vi.useFakeTimers();
    // Net document listeners, applied in call order: a removal that runs
    // before the matching add does not cancel it.
    const attached: Array<{ type: string; listener: unknown }> = [];
    vi.spyOn(document, "addEventListener").mockImplementation(((
      type: string,
      listener: unknown,
    ) => {
      attached.push({ type, listener });
    }) as typeof document.addEventListener);
    vi.spyOn(document, "removeEventListener").mockImplementation(((
      type: string,
      listener: unknown,
    ) => {
      const index = attached.findIndex(
        (entry) => entry.type === type && entry.listener === listener,
      );
      if (index !== -1) attached.splice(index, 1);
    }) as typeof document.removeEventListener);
    const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });
    showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn(), "default", "core-1");

    closeKeySelector();
    vi.runAllTimers();

    expect(attached.map((entry) => entry.type)).toEqual([]);
  });
});
