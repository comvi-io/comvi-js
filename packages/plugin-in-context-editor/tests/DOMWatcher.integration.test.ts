import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DOMWatcher } from "../src/DOMWatcher";
import { EventBus } from "../src/EventBus";
import { TAG_ATTRIBUTES, EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import type { TranslationSystemInnerOptions } from "../src/types";
import { cleanupDOM, flushDOMMutations } from "./helpers";

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
    it("should start observing DOM mutations", async () => {
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      const newElement = document.createElement("div");
      container.appendChild(newElement);

      await flushDOMMutations();

      const capturedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(capturedNodes).toContain(newElement);
    });

    it("should emit initialScan event on start", () => {
      const callback = vi.fn();
      eventBus.on("initialScan", callback);

      domWatcher.start();

      expect(callback).toHaveBeenCalledWith(container);
    });

    it("should stop observing when stopped", async () => {
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();
      domWatcher.stop();

      const textNode = document.createTextNode("test");
      container.appendChild(textNode);

      await flushDOMMutations();

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not start multiple times", () => {
      const callback = vi.fn();
      eventBus.on("initialScan", callback);

      domWatcher.start();
      domWatcher.start(); // Second call should be ignored

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
    it("should detect when nodes are removed", async () => {
      const div = document.createElement("div");
      container.appendChild(div);

      const callback = vi.fn();
      eventBus.on("nodesRemoved", callback);

      domWatcher.start();
      container.removeChild(div);
      await flushDOMMutations();

      const removedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(removedNodes).toContain(div);
    });

    it("should collect all descendant nodes when parent is removed", async () => {
      const parent = document.createElement("div");
      const child1 = document.createElement("span");
      const child2 = document.createElement("p");
      const textNode = document.createTextNode("text");

      child1.appendChild(textNode);
      parent.appendChild(child1);
      parent.appendChild(child2);
      container.appendChild(parent);

      const callback = vi.fn();
      eventBus.on("nodesRemoved", callback);

      domWatcher.start();
      container.removeChild(parent);
      await flushDOMMutations();

      const removedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(removedNodes).toEqual(expect.arrayContaining([parent, child1, child2, textNode]));
    });

    it("should collect attributes of removed elements", async () => {
      const input = document.createElement("input");
      input.setAttribute("placeholder", "test");
      input.setAttribute("title", "tooltip");
      container.appendChild(input);

      const callback = vi.fn();
      eventBus.on("nodesRemoved", callback);

      domWatcher.start();
      container.removeChild(input);
      await flushDOMMutations();

      const removedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(removedNodes).toContain(input);
      const attributeNames = removedNodes
        .filter((n) => n.nodeType === Node.ATTRIBUTE_NODE)
        .map((n) => (n as Attr).name)
        .sort();
      expect(attributeNames).toEqual(["placeholder", "title"]);
    });
  });

  describe("Complex mutation scenarios", () => {
    it("should handle rapid successive mutations", async () => {
      const structureChanges: Node[] = [];
      eventBus.on("structureChanges", (nodes: Node[]) => {
        structureChanges.push(...nodes);
      });

      domWatcher.start();

      const paragraphs = Array.from({ length: 10 }, (_, i) => {
        const p = document.createElement("p");
        p.appendChild(document.createTextNode(`Text ${i}`));
        container.appendChild(p);
        return p;
      });

      await flushDOMMutations();

      expect(structureChanges).toEqual(expect.arrayContaining(paragraphs));
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

      expect(new Set(events)).toEqual(new Set(["text", "attr", "structure"]));
    });

    it("should handle innerHTML changes", async () => {
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);

      domWatcher.start();

      container.innerHTML = "<div><span>New content</span></div>";

      await flushDOMMutations();

      const capturedNodes = callback.mock.calls.flatMap((call) => call[0] as Node[]);
      expect(capturedNodes).toContain(container.querySelector("div"));
      expect(capturedNodes).toContain(container.querySelector("span"));
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

      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      domWatcher.start();

      textNode.nodeValue = "change1";
      textNode.nodeValue = "change2";
      textNode.nodeValue = "change3";

      await flushDOMMutations();

      expect(callback).toHaveBeenCalledTimes(1);
      const captured = callback.mock.calls[0][0] as Node[];
      expect(captured.filter((n) => n === textNode)).toHaveLength(1);
    });

    it("keeps notifying the remaining subscribers when one listener throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const survivor = vi.fn();
      eventBus.on("structureChanges", () => {
        throw new Error("bad subscriber");
      });
      eventBus.on("structureChanges", survivor);

      domWatcher.start();
      const div = document.createElement("div");
      container.appendChild(div);
      await flushDOMMutations();

      expect(survivor).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in event listener for "structureChanges":',
        expect.any(Error),
      );
    });
  });
});

const PRISTINE_ATTACH_SHADOW = Element.prototype.attachShadow;

describe("DOMWatcher", () => {
  let container: HTMLDivElement;
  let watchers: DOMWatcher[];

  interface Watched {
    watcher: DOMWatcher;
    eventBus: EventBus;
    scans: Node[];
  }

  function watch(targetElement: Node): Watched {
    const eventBus = new EventBus();
    const scans: Node[] = [];
    eventBus.on("initialScan", (root: Node) => {
      scans.push(root);
    });
    const watcher = new DOMWatcher(eventBus, { targetElement, tagAttributes: TAG_ATTRIBUTES });
    watchers.push(watcher);
    return { watcher, eventBus, scans };
  }

  function recordEventNames(eventBus: EventBus): string[] {
    const names: string[] = [];
    for (const name of [
      "textChanges",
      "attributeChanges",
      "structureChanges",
      "nodesRemoved",
    ] as const) {
      eventBus.on(name, () => names.push(name));
    }
    return names;
  }

  beforeEach(() => {
    watchers = [];
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    watchers.forEach((watcher) => watcher.stop());
    // Restore the prototype the module patches, so no test can leak a patched
    // attachShadow into the next one.
    Element.prototype.attachShadow = PRISTINE_ATTACH_SHADOW;
    cleanupDOM();
  });

  describe("observation lifecycle", () => {
    it("stops reporting text changes after stop()", async () => {
      const textNode = document.createTextNode("initial");
      container.appendChild(textNode);
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      watcher.start();
      watcher.stop();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback).not.toHaveBeenCalled();
    });

    it("reports text changes again after being restarted", async () => {
      const textNode = document.createTextNode("initial");
      container.appendChild(textNode);
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      watcher.start();
      watcher.stop();
      watcher.start();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback.mock.calls).toEqual([[[textNode]]]);
    });

    it("patches attachShadow while observing and restores it on stop", () => {
      const { watcher } = watch(container);

      watcher.start();
      expect(Element.prototype.attachShadow).not.toBe(PRISTINE_ATTACH_SHADOW);

      watcher.stop();

      expect(Element.prototype.attachShadow).toBe(PRISTINE_ATTACH_SHADOW);
    });

    it("keeps the attachShadow patch until the last watcher stops", () => {
      const other = document.createElement("div");
      document.body.appendChild(other);
      const first = watch(container);
      const second = watch(other);
      first.watcher.start();
      second.watcher.start();

      first.watcher.stop();
      const host = document.createElement("div");
      other.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });
      expect(second.scans).toContain(shadowRoot);

      second.watcher.stop();

      expect(Element.prototype.attachShadow).toBe(PRISTINE_ATTACH_SHADOW);
    });

    it("leaves attachShadow alone where the environment has no shadow DOM", () => {
      const { watcher } = watch(container);
      // @ts-expect-error - modelling a DOM implementation without attachShadow
      delete Element.prototype.attachShadow;

      watcher.start();

      expect(Element.prototype.attachShadow).toBeUndefined();
    });

    it("observes nothing when the target is neither a document, an element nor a fragment", async () => {
      const textNode = document.createTextNode("initial");
      container.appendChild(textNode);
      const { watcher, eventBus } = watch(textNode);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);

      watcher.start();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback).not.toHaveBeenCalled();
    });

    it("reports no attribute changes when no tag attributes are configured", async () => {
      const input = document.createElement("input");
      container.appendChild(input);
      const eventBus = new EventBus();
      // The runtime contract has to survive a caller that omits the config, so
      // the options are deliberately forced past the required `tagAttributes`.
      const watcher = new DOMWatcher(eventBus, {
        targetElement: container,
      } as unknown as TranslationSystemInnerOptions);
      watchers.push(watcher);
      const callback = vi.fn();
      eventBus.on("attributeChanges", callback);

      watcher.start();
      input.setAttribute("placeholder", "Enter text");
      await flushDOMMutations();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("shadow root discovery", () => {
    it("scans a shadow root attached to the target element itself", () => {
      const { watcher, scans } = watch(container);
      watcher.start();

      const shadowRoot = container.attachShadow({ mode: "open" });

      expect(scans).toContain(shadowRoot);
    });

    it("ignores a shadow root attached to a host outside the target element", () => {
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      const { watcher, scans } = watch(container);
      watcher.start();

      const shadowRoot = outside.attachShadow({ mode: "open" });

      expect(scans).not.toContain(shadowRoot);
    });

    it("ignores a shadow root attached to an editor UI host after start", () => {
      const host = document.createElement("div");
      host.setAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE, "true");
      container.appendChild(host);
      const { watcher, scans } = watch(container);
      watcher.start();

      const shadowRoot = host.attachShadow({ mode: "open" });

      expect(scans).not.toContain(shadowRoot);
    });

    it("scans a shadow root nested inside another shadow root", () => {
      const outerHost = document.createElement("div");
      container.appendChild(outerHost);
      const outerRoot = outerHost.attachShadow({ mode: "open" });
      const innerHost = document.createElement("div");
      outerRoot.appendChild(innerHost);
      const innerRoot = innerHost.attachShadow({ mode: "open" });
      const { watcher, scans } = watch(container);

      watcher.start();

      expect(scans).toEqual(expect.arrayContaining([container, outerRoot, innerRoot]));
    });

    it("scans the shadow roots already in the page when the document is the target", () => {
      const host = document.createElement("div");
      container.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });
      const { watcher, scans } = watch(document);

      watcher.start();

      expect(scans).toContain(shadowRoot);
    });

    it("scans a shadow root attached after start when the document is the target", () => {
      const host = document.createElement("div");
      container.appendChild(host);
      const { watcher, scans } = watch(document);
      watcher.start();

      const shadowRoot = host.attachShadow({ mode: "open" });

      expect(scans).toContain(shadowRoot);
    });

    it("ignores a shadow root attached inside another document", () => {
      const foreignDocument = document.implementation.createHTMLDocument("foreign");
      const foreignHost = foreignDocument.createElement("div");
      foreignDocument.body.appendChild(foreignHost);
      const { watcher, scans } = watch(document);
      watcher.start();

      const shadowRoot = foreignHost.attachShadow({ mode: "open" });

      expect(scans).not.toContain(shadowRoot);
    });

    it("stops observing a shadow root whose host is removed", async () => {
      const host = document.createElement("div");
      container.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });
      const textNode = document.createTextNode("initial");
      shadowRoot.appendChild(textNode);
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);
      watcher.start();

      host.remove();
      await flushDOMMutations();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("re-attached subtrees", () => {
    it("observes a shadow root again when its host is put back", async () => {
      const host = document.createElement("div");
      container.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });
      const textNode = document.createTextNode("initial");
      shadowRoot.appendChild(textNode);
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);
      watcher.start();

      host.remove();
      await flushDOMMutations();
      container.appendChild(host);
      await flushDOMMutations();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback).toHaveBeenCalledWith([textNode]);
    });
  });

  describe("initial scan timing", () => {
    it("defers the initial scan until its own document has finished loading", () => {
      const foreignDocument = document.implementation.createHTMLDocument("foreign");
      Object.defineProperty(foreignDocument, "readyState", {
        configurable: true,
        get: () => "loading",
      });
      const { watcher, scans } = watch(foreignDocument);

      watcher.start();
      expect(scans).toEqual([]);

      foreignDocument.dispatchEvent(new Event("DOMContentLoaded"));

      expect(scans).toEqual([foreignDocument]);
    });
  });

  describe("mutation batching", () => {
    it("emits only structure changes when a node is added", async () => {
      const { watcher, eventBus } = watch(container);
      const emitted = recordEventNames(eventBus);
      watcher.start();

      container.appendChild(document.createElement("div"));
      await flushDOMMutations();

      expect(emitted).toEqual(["structureChanges"]);
    });

    it("emits only text changes when a text node's value changes", async () => {
      const textNode = document.createTextNode("initial");
      container.appendChild(textNode);
      const { watcher, eventBus } = watch(container);
      const emitted = recordEventNames(eventBus);
      watcher.start();

      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(emitted).toEqual(["textChanges"]);
    });

    it("reports the parent of an added node alongside the node", async () => {
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("structureChanges", callback);
      watcher.start();

      const added = document.createElement("div");
      container.appendChild(added);
      await flushDOMMutations();

      expect(callback).toHaveBeenCalledWith([container, added]);
    });

    it("reports a mutation inside an added subtree once", async () => {
      const { watcher, eventBus } = watch(container);
      const callback = vi.fn();
      eventBus.on("textChanges", callback);
      watcher.start();

      const added = document.createElement("div");
      const textNode = document.createTextNode("initial");
      added.appendChild(textNode);
      container.appendChild(added);
      await flushDOMMutations();
      textNode.nodeValue = "changed";
      await flushDOMMutations();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
