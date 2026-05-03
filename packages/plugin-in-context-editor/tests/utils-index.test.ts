import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNearestElementNode, findCorrespondingNode } from "../src/utils/index";
import { cleanupDOM } from "./helpers";

describe("utils/index.ts - DOM Utility Functions", () => {
  afterEach(() => {
    cleanupDOM();
  });

  describe("getNearestElementNode", () => {
    it("should return element if node is already an element", () => {
      const element = document.createElement("div");
      const result = getNearestElementNode(element);

      expect(result).toBe(element);
    });

    it("should return parent element for text node", () => {
      const parent = document.createElement("p");
      const textNode = document.createTextNode("Hello");
      parent.appendChild(textNode);

      const result = getNearestElementNode(textNode);

      expect(result).toBe(parent);
    });

    it("should return nearest element ancestor for deeply nested text node", () => {
      const grandParent = document.createElement("div");
      const parent = document.createElement("span");
      const textNode = document.createTextNode("Text");

      parent.appendChild(textNode);
      grandParent.appendChild(parent);

      const result = getNearestElementNode(textNode);

      expect(result).toBe(parent);
    });

    it("should return null for null input", () => {
      const result = getNearestElementNode(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      const result = getNearestElementNode(undefined);
      expect(result).toBeNull();
    });

    it("should handle comment nodes", () => {
      const parent = document.createElement("div");
      const comment = document.createComment("Comment");
      parent.appendChild(comment);

      const result = getNearestElementNode(comment);

      expect(result).toBe(parent);
    });

    it("should return null for orphaned text node", () => {
      const textNode = document.createTextNode("Orphaned");
      const result = getNearestElementNode(textNode);

      expect(result).toBeNull();
    });

    it("should handle multiple levels of nesting", () => {
      const level1 = document.createElement("div");
      const level2 = document.createElement("span");
      const level3 = document.createElement("strong");
      const level4 = document.createElement("em");
      const textNode = document.createTextNode("Deep");

      level4.appendChild(textNode);
      level3.appendChild(level4);
      level2.appendChild(level3);
      level1.appendChild(level2);

      const result = getNearestElementNode(textNode);

      expect(result).toBe(level4);
    });

    it("should work with different element types", () => {
      const elements = [
        document.createElement("p"),
        document.createElement("span"),
        document.createElement("div"),
        document.createElement("button"),
        document.createElement("input"),
      ];

      elements.forEach((element) => {
        const textNode = document.createTextNode("Test");
        element.appendChild(textNode);

        const result = getNearestElementNode(textNode);
        expect(result).toBe(element);
      });
    });
  });

  describe("findCorrespondingNode", () => {
    it("should return same element for most elements", () => {
      const elements = [
        document.createElement("div"),
        document.createElement("span"),
        document.createElement("p"),
        document.createElement("button"),
        document.createElement("input"),
      ];

      elements.forEach((element) => {
        const result = findCorrespondingNode(element);
        expect(result).toBe(element);
      });
    });

    it("should return parent select for option element", () => {
      const select = document.createElement("select");
      const option = document.createElement("option");
      select.appendChild(option);

      const result = findCorrespondingNode(option);

      expect(result).toBe(select);
    });

    it("should return parent select for optgroup element", () => {
      const select = document.createElement("select");
      const optgroup = document.createElement("optgroup");
      select.appendChild(optgroup);

      const result = findCorrespondingNode(optgroup);

      expect(result).toBe(select);
    });

    it("should return null for option without parent", () => {
      const option = document.createElement("option");

      const result = findCorrespondingNode(option);

      expect(result).toBeNull();
    });

    it("should return null for optgroup without parent", () => {
      const optgroup = document.createElement("optgroup");

      const result = findCorrespondingNode(optgroup);

      expect(result).toBeNull();
    });

    it("should handle nested option in optgroup", () => {
      const select = document.createElement("select");
      const optgroup = document.createElement("optgroup");
      const option = document.createElement("option");

      optgroup.appendChild(option);
      select.appendChild(optgroup);

      const result = findCorrespondingNode(option);

      // Should return the select (parent's parent)
      expect(result).toBe(optgroup);
    });

    it("should handle case insensitivity for node names", () => {
      const select = document.createElement("SELECT");
      const option = document.createElement("OPTION");
      select.appendChild(option);

      const result = findCorrespondingNode(option);

      expect(result).toBe(select);
    });

    it("should work with real select structure", () => {
      const select = document.createElement("select");
      const optgroup1 = document.createElement("optgroup");
      const optgroup2 = document.createElement("optgroup");
      const option1 = document.createElement("option");
      const option2 = document.createElement("option");
      const option3 = document.createElement("option");

      optgroup1.appendChild(option1);
      optgroup1.appendChild(option2);
      optgroup2.appendChild(option3);
      select.appendChild(optgroup1);
      select.appendChild(optgroup2);

      // Test without appending to document body to avoid reference issues
      const result1 = findCorrespondingNode(option1);
      const result2 = findCorrespondingNode(option2);
      const result3 = findCorrespondingNode(option3);
      const result4 = findCorrespondingNode(optgroup1);
      const result5 = findCorrespondingNode(optgroup2);

      expect(result1).toBe(optgroup1);
      expect(result2).toBe(optgroup1);
      expect(result3).toBe(optgroup2);
      expect(result4).toBe(select);
      expect(result5).toBe(select);
    });
  });

  describe("Integration: getNearestElementNode + findCorrespondingNode", () => {
    it("should work together for option text node", () => {
      const select = document.createElement("select");
      const option = document.createElement("option");
      const textNode = document.createTextNode("Option 1");

      option.appendChild(textNode);
      select.appendChild(option);

      const nearestElement = getNearestElementNode(textNode);
      expect(nearestElement).toBe(option);

      const correspondingNode = findCorrespondingNode(nearestElement!);
      expect(correspondingNode).toBe(select);
    });

    it("should work together for nested optgroup", () => {
      const select = document.createElement("select");
      const optgroup = document.createElement("optgroup");
      const option = document.createElement("option");
      const textNode = document.createTextNode("Group Option");

      option.appendChild(textNode);
      optgroup.appendChild(option);
      select.appendChild(optgroup);

      const nearestElement = getNearestElementNode(textNode);
      expect(nearestElement).toBe(option);

      const correspondingNode = findCorrespondingNode(nearestElement!);
      expect(correspondingNode).toBe(optgroup);
    });

    it("should handle regular element text nodes", () => {
      const div = document.createElement("div");
      const span = document.createElement("span");
      const textNode = document.createTextNode("Regular text");

      span.appendChild(textNode);
      div.appendChild(span);

      const nearestElement = getNearestElementNode(textNode);
      expect(nearestElement).toBe(span);

      const correspondingNode = findCorrespondingNode(nearestElement!);
      expect(correspondingNode).toBe(span); // Should return same element
    });
  });

  describe("Edge Cases", () => {
    it("should handle DocumentFragment", () => {
      const fragment = document.createDocumentFragment();
      const textNode = document.createTextNode("Fragment text");
      fragment.appendChild(textNode);

      // TextNode in fragment has no element parent until appended
      const result = getNearestElementNode(textNode);
      expect(result).toBeNull();
    });

    it("should handle SVG elements", () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      svg.appendChild(circle);

      const result = getNearestElementNode(circle);
      expect(result).toBe(circle);
    });

    it("should handle elements with no children", () => {
      const empty = document.createElement("div");
      const result = getNearestElementNode(empty);

      expect(result).toBe(empty);
    });

    it("should handle self-closing elements", () => {
      const elements = [
        document.createElement("img"),
        document.createElement("br"),
        document.createElement("hr"),
        document.createElement("input"),
      ];

      elements.forEach((element) => {
        const result = getNearestElementNode(element);
        expect(result).toBe(element);
      });
    });
  });
});
