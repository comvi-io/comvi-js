import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { EventBus } from "../src/EventBus";
import { cleanupDOM } from "./helpers";

describe("translatedElementsMap.ts - Element Translation Map", () => {
  let map: TranslationRegistry;
  let eventBus: EventBus;
  let onTranslationRegistered: ReturnType<typeof vi.fn>;
  let onTranslationRemoved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new EventBus();
    onTranslationRegistered = vi.fn();
    onTranslationRemoved = vi.fn();

    // Subscribe to events to verify they are emitted
    eventBus.on("translationRegistered", onTranslationRegistered);
    eventBus.on("translationRemoved", onTranslationRemoved);

    map = new TranslationRegistry(eventBus);
  });

  afterEach(() => {
    cleanupDOM();
  });

  describe("add", () => {
    it("should add element with translation data", () => {
      const element = document.createElement("div");
      const textNode = document.createTextNode("test");
      const data = {
        nodes: new Map([[textNode, { key: "test.key" }]]),
      };

      map.add(element, data);

      expect(map.has(element)).toBe(true);
      expect(map.get(element)).toEqual(data);
    });

    it("should emit translationRegistered event when adding", () => {
      const element = document.createElement("div");
      const data = {
        nodes: new Map([[document.createTextNode("test"), { key: "test.key" }]]),
      };

      map.add(element, data);

      expect(onTranslationRegistered).toHaveBeenCalledWith(element, data);
    });

    it("should not add duplicate elements", () => {
      const element = document.createElement("div");
      const data1 = {
        nodes: new Map([[document.createTextNode("test1"), { key: "key1" }]]),
      };
      const data2 = {
        nodes: new Map([[document.createTextNode("test2"), { key: "key2" }]]),
      };

      map.add(element, data1);
      map.add(element, data2);

      // Should keep original data
      expect(map.get(element)).toEqual(data1);
    });

    it("should throw error for null element", () => {
      expect(() => {
        map.add(null as any, {
          nodes: new Map(),
        });
      }).toThrow("Element cannot be null or undefined");
    });

    it("should throw error for undefined element", () => {
      expect(() => {
        map.add(undefined as any, {
          nodes: new Map(),
        });
      }).toThrow("Element cannot be null or undefined");
    });

    it("should handle multiple different elements", () => {
      const div = document.createElement("div");
      const span = document.createElement("span");
      const p = document.createElement("p");

      map.add(div, { nodes: new Map([[document.createTextNode("div"), { key: "1" }]]) });
      map.add(span, { nodes: new Map([[document.createTextNode("span"), { key: "2" }]]) });
      map.add(p, { nodes: new Map([[document.createTextNode("p"), { key: "3" }]]) });

      expect(map.size()).toBe(3);
      expect(map.has(div)).toBe(true);
      expect(map.has(span)).toBe(true);
      expect(map.has(p)).toBe(true);
    });
  });

  describe("remove", () => {
    it("should remove element from map", () => {
      const element = document.createElement("div");
      const data = {
        nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
      };

      map.add(element, data);
      expect(map.has(element)).toBe(true);

      map.remove(element);
      expect(map.has(element)).toBe(false);
    });

    it("should emit translationRemoved event when removing", () => {
      const element = document.createElement("div");
      const data = {
        nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
      };

      map.add(element, data);
      map.remove(element);

      expect(onTranslationRemoved).toHaveBeenCalledWith(element);
    });

    it("should handle removing non-existent element", () => {
      const element = document.createElement("div");
      map.remove(element);

      expect(map.size()).toBe(0);
      expect(onTranslationRemoved).not.toHaveBeenCalled();
    });

    it("should throw error for null element", () => {
      expect(() => {
        map.remove(null as any);
      }).toThrow("Element cannot be null or undefined");
    });

    it("should throw error for undefined element", () => {
      expect(() => {
        map.remove(undefined as any);
      }).toThrow("Element cannot be null or undefined");
    });
  });

  describe("addOrUpdate", () => {
    it("should add element if it does not exist", () => {
      const element = document.createElement("div");
      const textNode = document.createTextNode("test");
      const data = {
        nodes: new Map([[textNode, { key: "test.key" }]]),
      };

      map.addOrUpdate(element, data);

      expect(map.has(element)).toBe(true);
      expect(map.get(element)?.nodes.get(textNode)).toEqual({ key: "test.key" });
    });

    it("should update element if it exists", () => {
      const element = document.createElement("div");
      const textNode1 = document.createTextNode("test1");
      const textNode2 = document.createTextNode("test2");

      const data1 = {
        nodes: new Map([[textNode1, { key: "key1" }]]),
      };
      const data2 = {
        nodes: new Map([[textNode2, { key: "key2" }]]),
      };

      map.add(element, data1);
      map.addOrUpdate(element, data2);

      const result = map.get(element);
      expect(result?.nodes.size).toBe(2);
      expect(result?.nodes.get(textNode1)).toEqual({ key: "key1" });
      expect(result?.nodes.get(textNode2)).toEqual({ key: "key2" });
    });

    it("should merge multiple node data", () => {
      const element = document.createElement("input");
      const attrNode =
        element.getAttributeNode("placeholder") || document.createAttribute("placeholder");
      const titleAttr = document.createAttribute("title");
      const ariaAttr = document.createAttribute("aria-label");

      map.addOrUpdate(element, {
        nodes: new Map([[attrNode, { key: "placeholder.key" }]]),
      });
      map.addOrUpdate(element, {
        nodes: new Map([[titleAttr, { key: "title.key" }]]),
      });
      map.addOrUpdate(element, {
        nodes: new Map([[ariaAttr, { key: "aria.key" }]]),
      });

      const result = map.get(element);
      expect(result?.nodes.size).toBe(3);
    });

    it("should overwrite existing node data with same node", () => {
      const element = document.createElement("div");
      const textNode = document.createTextNode("test");

      map.addOrUpdate(element, {
        nodes: new Map([[textNode, { key: "old.key" }]]),
      });
      map.addOrUpdate(element, {
        nodes: new Map([[textNode, { key: "new.key" }]]),
      });

      const result = map.get(element);
      expect(result?.nodes.get(textNode)).toEqual({ key: "new.key" });
    });

    it("should throw error for null element", () => {
      expect(() => {
        map.addOrUpdate(null as any, { nodes: new Map() });
      }).toThrow("Element cannot be null or undefined");
    });
  });

  describe("get", () => {
    it("should return element data if exists", () => {
      const element = document.createElement("div");
      const data = {
        nodes: new Map([[document.createTextNode("test"), { key: "key" }]]),
      };

      map.add(element, data);
      const result = map.get(element);

      expect(result).toEqual(data);
    });

    it("should return undefined for non-existent element", () => {
      const element = document.createElement("div");
      const result = map.get(element);

      expect(result).toBeUndefined();
    });

    it("should return correct data for multiple elements", () => {
      const div = document.createElement("div");
      const span = document.createElement("span");

      const divData = {
        nodes: new Map([[document.createTextNode("div"), { key: "div.key" }]]),
      };
      const spanData = {
        nodes: new Map([[document.createTextNode("span"), { key: "span.key" }]]),
      };

      map.add(div, divData);
      map.add(span, spanData);

      expect(map.get(div)).toEqual(divData);
      expect(map.get(span)).toEqual(spanData);
    });
  });

  describe("has", () => {
    it("should return true if element exists", () => {
      const element = document.createElement("div");
      map.add(element, { nodes: new Map() });

      expect(map.has(element)).toBe(true);
    });

    it("should return false if element does not exist", () => {
      const element = document.createElement("div");
      expect(map.has(element)).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all elements", () => {
      const elements = [
        document.createElement("div"),
        document.createElement("span"),
        document.createElement("p"),
      ];

      elements.forEach((el) => {
        map.add(el, { nodes: new Map() });
      });

      expect(map.size()).toBe(3);

      map.clear();

      expect(map.size()).toBe(0);
      elements.forEach((el) => {
        expect(map.has(el)).toBe(false);
      });
    });
  });

  describe("size", () => {
    it("should return 0 for empty map", () => {
      expect(map.size()).toBe(0);
    });

    it("should return correct count", () => {
      map.add(document.createElement("div"), { nodes: new Map() });
      expect(map.size()).toBe(1);

      map.add(document.createElement("span"), { nodes: new Map() });
      expect(map.size()).toBe(2);

      map.add(document.createElement("p"), { nodes: new Map() });
      expect(map.size()).toBe(3);
    });

    it("should update when elements are removed", () => {
      const div = document.createElement("div");
      const span = document.createElement("span");

      map.add(div, { nodes: new Map() });
      map.add(span, { nodes: new Map() });

      expect(map.size()).toBe(2);

      map.remove(div);
      expect(map.size()).toBe(1);

      map.remove(span);
      expect(map.size()).toBe(0);
    });
  });

  describe("cleanupRemovedNodes", () => {
    it("should remove elements that are in removedNodes set", () => {
      const element = document.createElement("div");
      map.add(element, { nodes: new Map() });

      const removedNodes = new Set<Node | Attr>([element]);
      map.cleanupRemovedNodes(removedNodes);

      expect(map.has(element)).toBe(false);
    });

    it("should remove node references from element data", () => {
      const element = document.createElement("div");
      const textNode1 = document.createTextNode("keep");
      const textNode2 = document.createTextNode("remove");

      map.add(element, {
        nodes: new Map([
          [textNode1, { key: "key1" }],
          [textNode2, { key: "key2" }],
        ]),
      });

      const removedNodes = new Set<Node | Attr>([textNode2]);
      map.cleanupRemovedNodes(removedNodes);

      const result = map.get(element);
      expect(result?.nodes.size).toBe(1);
      expect(result?.nodes.has(textNode1)).toBe(true);
      expect(result?.nodes.has(textNode2)).toBe(false);
    });

    it("should remove element if all nodes are removed", () => {
      const element = document.createElement("div");
      const textNode = document.createTextNode("test");

      map.add(element, {
        nodes: new Map([[textNode, { key: "key" }]]),
      });

      const removedNodes = new Set<Node | Attr>([textNode]);
      map.cleanupRemovedNodes(removedNodes);

      expect(map.has(element)).toBe(false);
    });

    it("should handle node contained within removed node", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      const textNode = document.createTextNode("text");

      child.appendChild(textNode);
      parent.appendChild(child);

      map.add(child, {
        nodes: new Map([[textNode, { key: "key" }]]),
      });

      // Remove parent (should affect child)
      const removedNodes = new Set<Node | Attr>([parent]);
      map.cleanupRemovedNodes(removedNodes);

      // Child's text node should be detected as affected
      const result = map.get(child);
      if (result) {
        expect(result.nodes.size).toBe(0);
      }
    });

    it("should handle attribute whose owner element was removed", () => {
      const element = document.createElement("div");
      const attr = document.createAttribute("title");
      element.setAttributeNode(attr);

      map.add(element, {
        nodes: new Map([[attr, { key: "attr.key" }]]),
      });

      const removedNodes = new Set<Node | Attr>([element]);
      map.cleanupRemovedNodes(removedNodes);

      expect(map.has(element)).toBe(false);
    });

    it("should handle empty removedNodes set", () => {
      const element = document.createElement("div");
      map.add(element, { nodes: new Map([[document.createTextNode("test"), { key: "key" }]]) });

      const removedNodes = new Set<Node | Attr>();
      map.cleanupRemovedNodes(removedNodes);

      expect(map.has(element)).toBe(true);
    });

    it("should handle multiple elements and nodes", () => {
      const div = document.createElement("div");
      const span = document.createElement("span");
      const textNode1 = document.createTextNode("text1");
      const textNode2 = document.createTextNode("text2");
      const textNode3 = document.createTextNode("text3");

      map.add(div, {
        nodes: new Map([
          [textNode1, { key: "key1" }],
          [textNode2, { key: "key2" }],
        ]),
      });
      map.add(span, {
        nodes: new Map([[textNode3, { key: "key3" }]]),
      });

      const removedNodes = new Set<Node | Attr>([textNode2, span]);
      map.cleanupRemovedNodes(removedNodes);

      // div should still exist but with only textNode1
      expect(map.has(div)).toBe(true);
      const divResult = map.get(div);
      expect(divResult?.nodes.size).toBe(1);
      expect(divResult?.nodes.has(textNode1)).toBe(true);

      // span should be removed
      expect(map.has(span)).toBe(false);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle element with multiple translation nodes", () => {
      const element = document.createElement("button");
      const textNode = document.createTextNode("Click me");
      const ariaAttr = document.createAttribute("aria-label");
      const titleAttr = document.createAttribute("title");

      element.appendChild(textNode);
      element.setAttributeNode(ariaAttr);
      element.setAttributeNode(titleAttr);

      map.add(element, {
        nodes: new Map([
          [textNode, { key: "button.text" }],
          [ariaAttr, { key: "button.aria" }],
          [titleAttr, { key: "button.title" }],
        ]),
      });

      const result = map.get(element);
      expect(result?.nodes.size).toBe(3);
    });

    it("should track numeric key IDs", () => {
      const element = document.createElement("div");
      const textNode = document.createTextNode("test");

      map.add(element, {
        nodes: new Map([[textNode, { key: 12345 }]]),
      });

      const result = map.get(element);
      expect(result?.nodes.get(textNode)?.key).toBe(12345);
    });

    it("should maintain separate data for sibling elements", () => {
      const container = document.createElement("div");
      const child1 = document.createElement("span");
      const child2 = document.createElement("span");

      container.appendChild(child1);
      container.appendChild(child2);

      map.add(child1, {
        nodes: new Map([[document.createTextNode("child1"), { key: "child1.key" }]]),
      });
      map.add(child2, {
        nodes: new Map([[document.createTextNode("child2"), { key: "child2.key" }]]),
      });

      expect(map.get(child1)?.nodes.size).toBe(1);
      expect(map.get(child2)?.nodes.size).toBe(1);
      expect(map.get(child1)).not.toEqual(map.get(child2));
    });
  });
});
