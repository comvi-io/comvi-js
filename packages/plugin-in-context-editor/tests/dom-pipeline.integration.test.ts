/**
 * The real watcher → scanner → registry pipeline over a live MutationObserver:
 * what a translator can Alt-click after the page rearranges itself.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOMWatcher } from "../src/DOMWatcher";
import { ElementHighlighter } from "../src/ElementHighlighter";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { TranslationScanner } from "../src/TranslationScanner";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE, TAG_ATTRIBUTES } from "../src/constants";
import { encodeKeyToInvisible, registerKey, resetEncoder } from "../src/translation";
import {
  cleanupDOM,
  flushDOMMutations,
  getActiveOverlay,
  mockBoundingClientRect,
  simulateKeyEvent,
  simulateMouseEvent,
} from "./helpers";

const PRISTINE_ATTACH_SHADOW = Element.prototype.attachShadow;

describe("DOM pipeline", () => {
  let container: HTMLDivElement;
  let stops: Array<() => void>;

  function marked(text: string, key: string): string {
    return `${text}${encodeKeyToInvisible(registerKey(key))}`;
  }

  function markedParagraph(text: string, key: string): HTMLParagraphElement {
    const paragraph = document.createElement("p");
    paragraph.textContent = marked(text, key);
    return paragraph;
  }

  function startPipeline(
    targetElement: Node,
    beforeStart: (eventBus: EventBus) => void = () => {},
  ): { registry: TranslationRegistry; eventBus: EventBus } {
    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);
    const options = { targetElement, tagAttributes: TAG_ATTRIBUTES };
    const scanner = new TranslationScanner(eventBus, registry, options);
    const watcher = new DOMWatcher(eventBus, options);
    beforeStart(eventBus);
    watcher.start();
    stops.push(() => {
      watcher.stop();
      scanner.destroy();
    });
    return { registry, eventBus };
  }

  beforeEach(() => {
    stops = [];
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    stops.forEach((stop) => stop());
    Element.prototype.attachShadow = PRISTINE_ATTACH_SHADOW;
    cleanupDOM();
    resetEncoder();
  });

  describe("moved elements", () => {
    it("translated element reparented inside the target → stays registered", async () => {
      const source = document.createElement("div");
      const destination = document.createElement("div");
      const paragraph = markedParagraph("Hello", "hello");
      source.appendChild(paragraph);
      container.append(source, destination);
      const { registry } = startPipeline(container);

      destination.append(paragraph);
      await flushDOMMutations();

      expect({ connected: paragraph.isConnected, registered: registry.has(paragraph) }).toEqual({
        connected: true,
        registered: true,
      });
    });

    it("translated list items reordered → every item stays registered", async () => {
      const list = document.createElement("ul");
      const first = document.createElement("li");
      first.textContent = marked("First", "first");
      const second = document.createElement("li");
      second.textContent = marked("Second", "second");
      list.append(first, second);
      container.appendChild(list);
      const { registry } = startPipeline(container);

      list.insertBefore(second, first);
      await flushDOMMutations();

      expect([registry.has(first), registry.has(second)]).toEqual([true, true]);
    });

    it("translated element moved out of the target → unregistered", async () => {
      const paragraph = markedParagraph("Hello", "hello");
      container.appendChild(paragraph);
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      const { registry } = startPipeline(container);

      outside.append(paragraph);
      await flushDOMMutations();

      expect(registry.has(paragraph)).toBe(false);
    });

    it("translated element added and removed in the same batch → never registered", async () => {
      const paragraph = markedParagraph("Hello", "hello");
      const { registry } = startPipeline(container);

      container.appendChild(paragraph);
      paragraph.remove();
      await flushDOMMutations();

      expect(registry.has(paragraph)).toBe(false);
    });

    it("marked text node moved to another element → registered on the new element only", async () => {
      const from = document.createElement("p");
      const to = document.createElement("p");
      const text = document.createTextNode(marked("Hello", "hello"));
      from.appendChild(text);
      container.append(from, to);
      const { registry } = startPipeline(container);

      to.appendChild(text);
      await flushDOMMutations();

      expect([registry.has(from), registry.get(to)?.nodes.get(text)?.key]).toEqual([
        false,
        "hello",
      ]);
    });
  });

  describe("shadow roots attached after start", () => {
    it("shadow root attached inside an observed shadow tree → its translations register", async () => {
      const outerHost = document.createElement("div");
      container.appendChild(outerHost);
      const outerRoot = outerHost.attachShadow({ mode: "open" });
      const innerHost = document.createElement("div");
      outerRoot.appendChild(innerHost);
      const { registry } = startPipeline(container);
      const markedChild = markedParagraph("Hello", "hello");

      innerHost.attachShadow({ mode: "open" }).appendChild(markedChild);
      await flushDOMMutations();

      expect(registry.has(markedChild)).toBe(true);
    });

    it("shadow root attached inside an editor UI shadow tree → stays unobserved", async () => {
      const editorHost = document.createElement("div");
      editorHost.setAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE, "true");
      container.appendChild(editorHost);
      const innerHost = document.createElement("div");
      editorHost.attachShadow({ mode: "open" }).appendChild(innerHost);
      const { registry } = startPipeline(container);
      const markedChild = markedParagraph("Hello", "hello");

      innerHost.attachShadow({ mode: "open" }).appendChild(markedChild);
      await flushDOMMutations();

      expect(registry.has(markedChild)).toBe(false);
    });
  });

  describe("work done per mutation", () => {
    function recordRegistryEvents(eventBus: EventBus): string[] {
      const events: string[] = [];
      for (const name of [
        "translationRegistered",
        "translationUpdated",
        "translationRemoved",
      ] as const) {
        eventBus.on(name, () => events.push(name));
      }
      return events;
    }

    it("unrelated element appended next to translated content → no registry event", async () => {
      container.appendChild(markedParagraph("Hello", "hello"));
      const { eventBus } = startPipeline(container);
      const events = recordRegistryEvents(eventBus);

      container.appendChild(document.createElement("div"));
      await flushDOMMutations();

      expect(events).toEqual([]);
    });

    it("translated text rewritten with identical content → no registry event", async () => {
      const paragraph = markedParagraph("Hello", "hello");
      container.appendChild(paragraph);
      const { eventBus } = startPipeline(container);
      const events = recordRegistryEvents(eventBus);
      const text = paragraph.firstChild!;

      text.nodeValue = `${text.nodeValue}`;
      await flushDOMMutations();

      expect(events).toEqual([]);
    });

    it("Alt-hover inserts the highlight overlay → no structure rescan", async () => {
      const paragraph = markedParagraph("Hello", "hello");
      mockBoundingClientRect(paragraph, { top: 0, left: 0, width: 100, height: 30 });
      container.appendChild(paragraph);
      const { eventBus } = startPipeline(document, (bus) => {
        const highlighter = new ElementHighlighter(bus, () => {});
        stops.push(() => highlighter.cleanup());
      });
      await flushDOMMutations();
      const rescans: Node[][] = [];
      eventBus.on("structureChanges", (nodes: Node[]) => rescans.push(nodes));

      simulateKeyEvent("keydown", "Alt");
      simulateMouseEvent(paragraph, "mouseover");
      await flushDOMMutations();

      expect({ overlayShown: getActiveOverlay() !== null, rescans }).toEqual({
        overlayShown: true,
        rescans: [],
      });
    });
  });
});
