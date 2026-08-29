import { describe, it, expect, afterEach } from "vitest";
import { getNearestElementNode, findCorrespondingNode } from "../src/utils/index";
import { cleanupDOM } from "./helpers";

afterEach(() => {
  cleanupDOM();
});

describe("getNearestElementNode()", () => {
  it("should return element if node is already an element", () => {
    const element = document.createElement("div");
    const result = getNearestElementNode(element);

    expect(result).toBe(element);
  });

  it.each(["img", "br", "hr", "input"])(
    "should return a void <%s> element unchanged",
    (tagName) => {
      const element = document.createElement(tagName);

      expect(getNearestElementNode(element)).toBe(element);
    },
  );

  it("should return parent element for text node", () => {
    const parent = document.createElement("p");
    const textNode = document.createTextNode("Hello");
    parent.appendChild(textNode);

    const result = getNearestElementNode(textNode);

    expect(result).toBe(parent);
  });

  it.each(["p", "span", "div", "button", "input"])(
    "should return the parent <%s> of a text node",
    (tagName) => {
      const element = document.createElement(tagName);
      const textNode = document.createTextNode("Test");
      element.appendChild(textNode);

      expect(getNearestElementNode(textNode)).toBe(element);
    },
  );

  it("should return nearest element ancestor for deeply nested text node", () => {
    const grandParent = document.createElement("div");
    const parent = document.createElement("span");
    const textNode = document.createTextNode("Text");

    parent.appendChild(textNode);
    grandParent.appendChild(parent);

    const result = getNearestElementNode(textNode);

    expect(result).toBe(parent);
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

  it("should handle comment nodes", () => {
    const parent = document.createElement("div");
    const comment = document.createComment("Comment");
    parent.appendChild(comment);

    const result = getNearestElementNode(comment);

    expect(result).toBe(parent);
  });

  it("should handle SVG elements", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    svg.appendChild(circle);

    const result = getNearestElementNode(circle);
    expect(result).toBe(circle);
  });

  it("should return null for orphaned text node", () => {
    const textNode = document.createTextNode("Orphaned");
    const result = getNearestElementNode(textNode);

    expect(result).toBeNull();
  });

  it("should handle DocumentFragment", () => {
    const fragment = document.createDocumentFragment();
    const textNode = document.createTextNode("Fragment text");
    fragment.appendChild(textNode);

    const result = getNearestElementNode(textNode);
    expect(result).toBeNull();
  });

  it("should return null for null input", () => {
    const result = getNearestElementNode(null);
    expect(result).toBeNull();
  });

  it("should return null for undefined input", () => {
    const result = getNearestElementNode(undefined);
    expect(result).toBeNull();
  });
});

describe("findCorrespondingNode()", () => {
  it.each(["div", "span", "p", "button", "input"])("should return a <%s> unchanged", (tagName) => {
    const element = document.createElement(tagName);

    expect(findCorrespondingNode(element)).toBe(element);
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

  it("should map an option inside an optgroup to that optgroup", () => {
    const select = document.createElement("select");
    const optgroup = document.createElement("optgroup");
    const option = document.createElement("option");

    optgroup.appendChild(option);
    select.appendChild(optgroup);

    const result = findCorrespondingNode(option);

    expect(result).toBe(optgroup);
  });

  it("should handle case insensitivity for node names", () => {
    const select = document.createElement("SELECT");
    const option = document.createElement("OPTION");
    select.appendChild(option);

    const result = findCorrespondingNode(option);

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
});

describe("getNearestElementNode() + findCorrespondingNode()", () => {
  it("should map an option's text node to the enclosing select", () => {
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
});
