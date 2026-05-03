import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src";
import type { VirtualNode } from "../../src";

describe("Virtual Node Interpolation", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("interpolates a virtual node param into an array result", () => {
    const vNode: VirtualNode = { type: "element", tag: "strong", props: {}, children: ["Bold"] };

    i18n.addTranslations({
      en: { text: "This is {bold} text" },
    });

    const result = i18n.tRaw("text", { bold: vNode });

    expect(result).toHaveLength(3);
    expect(result[0]).toBe("This is ");
    expect(result[1]).toBe(vNode);
    expect(result[2]).toBe(" text");
    expect(i18n.t("text", { bold: vNode })).toBe("This is Bold text");
  });

  it("flattens arrays of virtual nodes", () => {
    const vNodes = [
      { type: "text", text: "One" },
      { type: "text", text: "Two" },
    ] as VirtualNode[];

    i18n.addTranslations({
      en: { list: "Items: {items}" },
    });

    const result = i18n.tRaw("list", { items: vNodes });

    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Items: ");
    expect(result[1]).toBe(vNodes[0]);
    expect(result[2]).toBe(vNodes[1]);
    expect(i18n.t("list", { items: vNodes })).toBe("Items: OneTwo");
  });

  it("returns a single string when no virtual nodes are present", () => {
    i18n.addTranslations({ en: { simple: "Simple text" } });
    expect(i18n.t("simple")).toBe("Simple text");
  });

  it("supports virtual nodes inside plural options", () => {
    const vNode: VirtualNode = { type: "element", tag: "span", props: {}, children: ["5"] };

    i18n.addTranslations({
      en: {
        plural: "{count, plural, other {Count: {badge}}}",
      },
    });

    const result = i18n.tRaw("plural", { count: 5, badge: vNode });
    expect(result).toEqual(["Count: ", vNode]);
    expect(i18n.t("plural", { count: 5, badge: vNode })).toBe("Count: 5");
  });

  it("treats Vue-style VNodes as node values for interpolation", () => {
    const vueVNode = { __v_isVNode: true, type: "span", children: ["Vue"] };

    i18n.addTranslations({
      en: { text: "This is {node} text" },
    });

    const result = i18n.tRaw("text", { node: vueVNode as any });

    expect(result).toEqual(["This is ", vueVNode, " text"]);
  });

  it("treats React-style elements as node values for interpolation", () => {
    const reactElement = {
      $$typeof: Symbol.for("react.element"),
      type: "span",
      props: { children: "React" },
    };

    i18n.addTranslations({
      en: { text: "This is {node} text" },
    });

    const result = i18n.tRaw("text", { node: reactElement as any });

    expect(result).toEqual(["This is ", reactElement, " text"]);
  });
});
