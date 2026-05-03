import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DOMWatcher } from "../src/DOMWatcher";
import { EventBus } from "../src/EventBus";
import { TAG_ATTRIBUTES, EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { cleanupDOM } from "./helpers";

/** Wait for MutationObserver callbacks to process DOM mutations */
const flushDOMMutations = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
};

describe("DOMWatcher.integration.test.ts - DOM Mutation Observation", () => {
  let eventBus: EventBus;
  let domWatcher: DOMWatcher;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "test-container";
    document.body.appendChild(container);

    eventBus = new EventBus();
    domWatcher = new DOMWatcher(eventBus, {
      targetElement: container,
      tagAttributes: TAG_ATTRIBUTES,
    });
  });

  afterEach(() => {
    domWatcher.stop();
    cleanupDOM();
  });

  describe("start / stop", () => {
    it("should start observing DOM mutations", () => {
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      const newElement = document.createElement("div");
      container.appendChild(newElement);

      return flushDOMMutations().then(() => {
        expect(callback).toHaveBeenCalled();
        const capturedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
        expect(capturedNodes).toContain(newElement);
      });
    });

    it("should emit initialScan event on start", () => {
      return new Promise<void>((resolve) => {
        eventBus.on("initialScan", (target: Node) => {
          expect(target).toBe(container);
          resolve();
        });

        domWatcher.start();
      });
    });

    it("should stop observing when stopped", () => {
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();
      domWatcher.stop();

      const textNode = document.createTextNode("test");
      container.appendChild(textNode);

      return flushDOMMutations().then(() => {
        expect(callback).not.toHaveBeenCalled();
      });
    });

    it("should not start multiple times", () => {
      const callback = vi.fn();
      eventBus.on("initialScan", callback);

      domWatcher.start();
      domWatcher.start(); // Second call should be ignored

      // Should only emit initialScan once
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle stop when not started", () => {
      expect(() => {
        domWatcher.stop();
      }).not.toThrow();
    });

    it("should bind deferred initial scan to target ownerDocument", () => {
      const foreignDocument = document.implementation.createHTMLDocument("foreign");
      const foreignContainer = foreignDocument.createElement("div");
      foreignDocument.body.appendChild(foreignContainer);

      Object.defineProperty(foreignDocument, "readyState", {
        configurable: true,
        get: () => "loading",
      });

      const addEventListenerSpy = vi.spyOn(foreignDocument, "addEventListener");
      const foreignEventBus = new EventBus();
      const foreignInitialScans: Node[] = [];
      foreignEventBus.on("initialScan", (target: Node) => {
        foreignInitialScans.push(target);
      });

      const foreignWatcher = new DOMWatcher(foreignEventBus, {
        targetElement: foreignContainer,
        tagAttributes: TAG_ATTRIBUTES,
      });

      foreignWatcher.start();

      expect(addEventListenerSpy).toHaveBeenCalledWith("DOMContentLoaded", expect.any(Function), {
        once: true,
      });

      const domContentLoadedListener = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "DOMContentLoaded",
      )?.[1] as EventListener | undefined;
      domContentLoadedListener?.(new Event("DOMContentLoaded"));

      expect(foreignInitialScans).toContain(foreignContainer);
      foreignWatcher.stop();
      addEventListenerSpy.mockRestore();
    });
  });

  describe("textChanges events", () => {
    it("should detect text node changes", async () => {
      const textNode = document.createTextNode("initial");
      const p = document.createElement("p");
      p.appendChild(textNode);
      container.appendChild(p);

      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();

      textNode.nodeValue = "changed";

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toContain(textNode);
    });

    it("should emit text changes for multiple text nodes", async () => {
      const textNode1 = document.createTextNode("text1");
      const textNode2 = document.createTextNode("text2");
      const p = document.createElement("p");
      p.appendChild(textNode1);
      p.appendChild(textNode2);
      container.appendChild(p);

      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();

      textNode1.nodeValue = "changed1";
      textNode2.nodeValue = "changed2";

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      const capturedNodes = callback.mock.calls[0][0];
      expect(capturedNodes).toContain(textNode1);
      expect(capturedNodes).toContain(textNode2);
    });
  });

  describe("attributeChanges events", () => {
    it("should detect attribute changes on watched attributes", async () => {
      const input = document.createElement("input");
      container.appendChild(input);

      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      domWatcher.start();

      input.setAttribute("placeholder", "Enter text");

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toContain(input);
    });

    it("should only watch filtered attributes", async () => {
      const div = document.createElement("div");
      container.appendChild(div);

      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      domWatcher.start();

      // 'data-test' is not in TAG_ATTRIBUTES, should not trigger
      div.setAttribute("data-test", "value");

      await flushDOMMutations();

      // Callback should not have been called for non-watched attribute
      expect(callback).not.toHaveBeenCalled();
    });

    it("should detect changes to title attribute (universal)", async () => {
      const span = document.createElement("span");
      container.appendChild(span);

      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      domWatcher.start();

      span.setAttribute("title", "Tooltip");

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toContain(span);
    });

    it("should detect aria-label changes", async () => {
      const button = document.createElement("button");
      container.appendChild(button);

      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      domWatcher.start();

      button.setAttribute("aria-label", "Close");

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toContain(button);
    });
  });

  describe("structureChanges events", () => {
    it("should detect when nodes are added", async () => {
      const newDiv = document.createElement("div");

      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      container.appendChild(newDiv);

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      const capturedNodes = callback.mock.calls[0][0];
      expect(capturedNodes.some((n: Node) => n === newDiv)).toBe(true);
    });

    it("should detect when multiple nodes are added", async () => {
      const div1 = document.createElement("div");
      const div2 = document.createElement("span");

      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      container.appendChild(div1);
      container.appendChild(div2);

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      const capturedNodes = callback.mock.calls[0][0];
      expect(capturedNodes).toContain(div1);
      expect(capturedNodes).toContain(div2);
    });

    it("should detect nested node additions", async () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      parent.appendChild(child);

      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      container.appendChild(parent);

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      const capturedNodes = callback.mock.calls[0][0];
      expect(capturedNodes.some((n: Node) => n === parent)).toBe(true);
    });
  });

  describe("nodesRemoved events", () => {
    it("should detect when nodes are removed", () => {
      return new Promise<void>((resolve) => {
        const div = document.createElement("div");
        container.appendChild(div);

        eventBus.on("nodesRemoved", (nodes: Node[]) => {
          expect(nodes).toContain(div);
          resolve();
        });

        domWatcher.start();

        setTimeout(() => {
          // Check if div is still a child before removing
          if (container.contains(div)) {
            container.removeChild(div);
          }
        }, 10);
      });
    });

    it("should collect all descendant nodes when parent is removed", () => {
      return new Promise<void>((resolve) => {
        const parent = document.createElement("div");
        const child1 = document.createElement("span");
        const child2 = document.createElement("p");
        const textNode = document.createTextNode("text");

        child1.appendChild(textNode);
        parent.appendChild(child1);
        parent.appendChild(child2);
        container.appendChild(parent);

        eventBus.on("nodesRemoved", (nodes: Node[]) => {
          // Should include parent and all descendants
          expect(nodes).toContain(parent);
          expect(nodes).toContain(child1);
          expect(nodes).toContain(child2);
          expect(nodes).toContain(textNode);
          resolve();
        });

        domWatcher.start();

        setTimeout(() => {
          if (container.contains(parent)) {
            container.removeChild(parent);
          }
        }, 10);
      });
    });

    it("should collect attributes of removed elements", () => {
      return new Promise<void>((resolve) => {
        const input = document.createElement("input");
        input.setAttribute("placeholder", "test");
        input.setAttribute("title", "tooltip");
        container.appendChild(input);

        eventBus.on("nodesRemoved", (nodes: Node[]) => {
          // Should include the element and its attributes
          expect(nodes).toContain(input);
          const attrs = Array.from(nodes).filter((n) => n.nodeType === Node.ATTRIBUTE_NODE);
          expect(attrs.length).toBeGreaterThan(0);
          resolve();
        });

        domWatcher.start();

        setTimeout(() => {
          if (container.contains(input)) {
            container.removeChild(input);
          }
        }, 10);
      });
    });
  });

  describe("Complex mutation scenarios", () => {
    it("should handle rapid successive mutations", async () => {
      const textChanges: Node[] = [];
      const structureChanges: Node[] = [];

      eventBus.on("textChanges", (nodes: Node[]) => {
        textChanges.push(...nodes);
      });

      eventBus.on("structureChanges", (nodes: Node[]) => {
        structureChanges.push(...nodes);
      });

      domWatcher.start();

      for (let i = 0; i < 10; i++) {
        const p = document.createElement("p");
        const text = document.createTextNode(`Text ${i}`);
        p.appendChild(text);
        container.appendChild(p);
      }

      await flushDOMMutations();

      expect(structureChanges.length).toBeGreaterThan(0);
    });

    it("should handle mixed mutation types", async () => {
      const p = document.createElement("p");
      const textNode = document.createTextNode("initial");
      p.appendChild(textNode);
      container.appendChild(p);

      const events: string[] = [];

      eventBus.on("textChanges", () => events.push("text"));
      eventBus.on("attributeChanges", () => events.push("attr"));
      eventBus.on("structureChanges", () => events.push("structure"));

      domWatcher.start();

      textNode.nodeValue = "changed";
      p.setAttribute("title", "tooltip");

      const newSpan = document.createElement("span");
      container.appendChild(newSpan);

      await flushDOMMutations();

      expect(events.length).toBeGreaterThan(0);
    });

    it("should handle innerHTML changes", async () => {
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      container.innerHTML = "<div><span>New content</span></div>";

      await flushDOMMutations();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].length).toBeGreaterThan(0);
    });
  });

  describe("Initial scan", () => {
    it("should scan existing DOM on start", () => {
      const existingDiv = document.createElement("div");
      const existingText = document.createTextNode("existing");
      existingDiv.appendChild(existingText);
      container.appendChild(existingDiv);

      return new Promise<void>((resolve) => {
        eventBus.on("initialScan", (target: Node) => {
          expect(target).toBe(container);
          resolve();
        });

        domWatcher.start();
      });
    });
  });

  describe("Shadow DOM support", () => {
    it("should detect text node changes inside open shadow roots", async () => {
      const host = document.createElement("div");
      const shadowRoot = host.attachShadow({ mode: "open" });
      const textNode = document.createTextNode("initial");
      shadowRoot.appendChild(textNode);
      container.appendChild(host);

      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();
      textNode.nodeValue = "updated";

      await flushDOMMutations();

      const capturedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(capturedNodes).toContain(textNode);
    });

    it("should emit initialScan for discovered shadow roots", () => {
      const host = document.createElement("div");
      const shadowRoot = host.attachShadow({ mode: "open" });
      shadowRoot.innerHTML = "<span>Inside shadow root</span>";
      container.appendChild(host);

      const initialScans: Node[] = [];
      eventBus.on("initialScan", (target: Node) => {
        initialScans.push(target);
      });

      domWatcher.start();

      expect(initialScans).toContain(container);
      expect(initialScans).toContain(shadowRoot);
    });

    it("should discover and scan newly added open shadow roots", async () => {
      const initialScanCallback = vi.fn();
      eventBus.on("initialScan", initialScanCallback);

      domWatcher.start();

      const host = document.createElement("div");
      const shadowRoot = host.attachShadow({ mode: "open" });
      shadowRoot.innerHTML = "<span>Late shadow root</span>";
      container.appendChild(host);

      await flushDOMMutations();

      const scannedRoots = initialScanCallback.mock.calls.map((call) => call[0] as Node);
      expect(scannedRoots).toContain(shadowRoot);
    });

    it("should ignore editor UI shadow roots", async () => {
      const host = document.createElement("div");
      host.setAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE, "true");
      const shadowRoot = host.attachShadow({ mode: "open" });
      const textNode = document.createTextNode("inside editor ui");
      shadowRoot.appendChild(textNode);
      container.appendChild(host);

      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();
      textNode.nodeValue = "changed";

      await flushDOMMutations();

      const capturedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(capturedNodes).not.toContain(textNode);
    });

    it("should observe shadow roots attached to existing hosts after start", async () => {
      const host = document.createElement("div");
      container.appendChild(host);

      const initialScanCallback = vi.fn();
      const textChangesCallback = vi.fn();
      eventBus.on("initialScan", initialScanCallback);
      eventBus.on("textChanges", textChangesCallback);

      domWatcher.start();

      const shadowRoot = host.attachShadow({ mode: "open" });
      const textNode = document.createTextNode("initial");
      shadowRoot.appendChild(textNode);

      await flushDOMMutations();

      const scannedRoots = initialScanCallback.mock.calls.map((call) => call[0] as Node);
      expect(scannedRoots).toContain(shadowRoot);

      textNode.nodeValue = "changed";
      await flushDOMMutations();

      const capturedNodes = textChangesCallback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(capturedNodes).toContain(textNode);
    });
  });

  describe("Edge cases", () => {
    it("should deduplicate mutation events", async () => {
      const p = document.createElement("p");
      const textNode = document.createTextNode("test");
      p.appendChild(textNode);
      container.appendChild(p);

      const textChangesCallCount = vi.fn();
      eventBus.on("textChanges", textChangesCallCount);

      domWatcher.start();

      // Rapid changes to same text node
      textNode.nodeValue = "change1";
      textNode.nodeValue = "change2";
      textNode.nodeValue = "change3";

      await flushDOMMutations();

      // Should be called, but mutations should be batched
      expect(textChangesCallCount).toHaveBeenCalled();
    });
  });
});
