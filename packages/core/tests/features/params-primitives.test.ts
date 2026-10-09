import { describe, it, expect } from "vitest";
import { isPrimitive, isVNodeLoose } from "../../src/core/translate/params";
import { createElement, createFragment, createTextNode } from "../../src/virtualNode";

// `isVNodeLoose` is loose about WHOSE node it is (core's or React's), never about shape.

describe("isPrimitive()", () => {
  it.each([
    ["string", "hello"],
    ["empty string", ""],
    ["number", 42],
    ["zero", 0],
    ["NaN", Number.NaN],
    ["boolean", false],
    ["null", null],
    ["undefined", undefined],
    ["symbol", Symbol("s")],
    ["bigint", 10n],
  ])("treats %s as primitive", (_label, value) => {
    expect(isPrimitive(value)).toBe(true);
  });

  it.each([
    ["plain object", {}],
    ["array", ["a"]],
    ["function", () => "x"],
    ["element node", createElement("b")],
    ["date", new Date(0)],
  ])("treats %s as non-primitive", (_label, value) => {
    expect(isPrimitive(value)).toBe(false);
  });
});

describe("isVNodeLoose()", () => {
  it.each([
    ["element node", createElement("b", {}, ["hi"])],
    ["text node", createTextNode("hi")],
    ["fragment node", createFragment(["hi"])],
  ])("accepts a framework-agnostic %s", (_label, value) => {
    expect(isVNodeLoose(value)).toBe(true);
  });

  it("accepts a React element by its $$typeof marker", () => {
    expect(isVNodeLoose({ $$typeof: Symbol.for("react.element"), type: "div" })).toBe(true);
  });

  it.each([
    ["plain object", {}],
    ["object with an unknown type", { type: "component" }],
    ["Vue VNode, whose __v_isVNode marker is a plain boolean", { __v_isVNode: true, type: "div" }],
    ["object shaped like an element node", { type: "element", tag: "b", props: {}, children: [] }],
    ["object whose $$typeof is not a symbol", { $$typeof: "react.element", type: "div" }],
    ["array", [createTextNode("hi")]],
    ["null", null],
    ["undefined", undefined],
    ["string", "text"],
    ["number", 0],
  ])("rejects %s", (_label, value) => {
    expect(isVNodeLoose(value)).toBe(false);
  });

  it("rejects a function even when it carries VNode-shaped fields", () => {
    // Tag handlers ARE functions and reach this predicate as param values.
    const handler = Object.assign(() => "rendered", {
      type: "element" as const,
      $$typeof: Symbol.for("react.element"),
    });

    expect(isVNodeLoose(handler)).toBe(false);
  });
});
