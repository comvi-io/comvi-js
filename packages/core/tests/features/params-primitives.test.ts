import { describe, it, expect } from "vitest";
import { isPrimitive, isVNodeLoose } from "../../src/core/translate/params";
import { createElement, createFragment, createTextNode } from "../../src/virtualNode";

// Both predicates are deliberately LOOSE about foreign node shapes (Vue VNodes, React elements).

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

  it("accepts a Vue VNode by its __v_isVNode marker", () => {
    expect(isVNodeLoose({ __v_isVNode: true, type: "div" })).toBe(true);
  });

  it("accepts a React element by its $$typeof marker", () => {
    expect(isVNodeLoose({ $$typeof: Symbol.for("react.element"), type: "div" })).toBe(true);
  });

  it.each([
    ["plain object", {}],
    ["object with an unknown type", { type: "component" }],
    ["object whose __v_isVNode is not true", { __v_isVNode: 1 }],
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
