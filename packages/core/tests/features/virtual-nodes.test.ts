import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { VirtualNode } from "../helpers/composedHost";

const NODE: VirtualNode = { type: "element", tag: "strong", props: {}, children: ["Bold"] };
const NODES = [
  { type: "text", text: "One" },
  { type: "text", text: "Two" },
] as VirtualNode[];

describe("tRaw() with node params", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("interpolates a virtual node param into an array result", () => {
    i18n.addTranslations({ en: { text: "This is {bold} text" } });

    const result = i18n.tRaw("text", { bold: NODE });

    expect(result).toEqual(["This is ", NODE, " text"]);
  });

  it("passes the caller's node through by reference rather than cloning it", () => {
    i18n.addTranslations({ en: { text: "This is {bold} text" } });

    const result = i18n.tRaw("text", { bold: NODE });

    expect(result[1]).toBe(NODE);
  });

  it("t() flattens a virtual node param to its inner text", () => {
    i18n.addTranslations({ en: { text: "This is {bold} text" } });

    expect(i18n.t("text", { bold: NODE })).toBe("This is Bold text");
  });

  it("flattens arrays of virtual nodes", () => {
    i18n.addTranslations({ en: { list: "Items: {items}" } });

    const result = i18n.tRaw("list", { items: NODES });

    expect(result).toEqual(["Items: ", NODES[0], NODES[1]]);
  });

  it("passes each node of an array param through by reference", () => {
    i18n.addTranslations({ en: { list: "Items: {items}" } });

    const result = i18n.tRaw("list", { items: NODES });

    expect(result[1]).toBe(NODES[0]);
    expect(result[2]).toBe(NODES[1]);
  });

  it("t() flattens an array of virtual node params to their text", () => {
    i18n.addTranslations({ en: { list: "Items: {items}" } });

    expect(i18n.t("list", { items: NODES })).toBe("Items: OneTwo");
  });

  it("tRaw() returns a single string when no virtual nodes are present", () => {
    i18n.addTranslations({ en: { simple: "Simple text" } });

    expect(i18n.tRaw("simple")).toBe("Simple text");
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
