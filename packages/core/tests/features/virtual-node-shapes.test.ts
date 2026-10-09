import { describe, expect, it } from "vitest";
import { createElement, isVirtualNode, translationResultToString } from "../../src";
import type { VirtualNode } from "../../src";
import { createFragment, createTextNode } from "../../src/virtualNode";

describe("isVirtualNode()", () => {
  it.each([
    ["element", createElement("b")],
    ["text", createTextNode("hi")],
    ["fragment", createFragment([])],
  ])("accepts a %s node the library built", (_label, node) => {
    expect(isVirtualNode(node)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "text"],
    ["a number", 42],
    ["an object without a type", {}],
    ["an object with an unknown type", { type: "portal" }],
    ["an object literal shaped like a node", { type: "text", text: "hi" }],
    ["a spread copy of a node", { ...createElement("b") }],
  ])("rejects %s", (_label, value) => {
    expect(isVirtualNode(value)).toBe(false);
  });
});

describe("createElement()", () => {
  it("defaults props and children to empty when only a tag is given", () => {
    expect(createElement("br")).toStrictEqual({
      type: "element",
      tag: "br",
      props: {},
      children: [],
    });
  });
});

describe("translationResultToString()", () => {
  it("returns a plain string result unchanged", () => {
    expect(translationResultToString("Hello")).toBe("Hello");
  });

  it("concatenates the text of an element node's nested children", () => {
    const result: VirtualNode[] = [
      createElement("b", {}, [{ type: "text", text: "bold" }, " tail"]),
    ];

    expect(translationResultToString(result)).toBe("bold tail");
  });

  it("concatenates across a fragment's children", () => {
    const result: Array<string | VirtualNode> = [
      "a ",
      { type: "fragment", children: [{ type: "text", text: "b" }, " c"] },
    ];

    expect(translationResultToString(result)).toBe("a b c");
  });
});
