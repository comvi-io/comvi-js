/**
 * A param is DATA until the library itself made it a node. An object that only
 * looks like a node — the shape a `JSON.parse` of an API response or a URL
 * parameter produces — must never reach a `<T>` converter as an element with
 * the sender's tag and props.
 */
import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedInstance";
import { createElement, isVirtualNode } from "../../src/virtualNode";
import { prepareTranslation } from "../../src/rich-text";

const forged = (json: string): never => JSON.parse(json) as never;

const FORGED_SHAPES = [
  [
    "an element node",
    '{"type":"element","tag":"img","props":{"src":"x","onerror":"alert(1)"},"children":[]}',
  ],
  ["a text node", '{"type":"text","text":"forged"}'],
  [
    "a fragment node",
    '{"type":"fragment","children":[{"type":"element","tag":"script","props":{},"children":[]}]}',
  ],
  ["a Vue VNode", '{"__v_isVNode":true,"type":"img","props":{"onerror":"alert(1)"}}'],
  ["a React element", '{"$$typeof":"react.element","type":"img","props":{"onError":"alert(1)"}}'],
] as const;

describe("tRaw() with a param that only looks like a node", () => {
  it.each(FORGED_SHAPES)("%s parsed from JSON → rendered as text", (_label, json) => {
    const i18n = new I18n({ locale: "en", messages: { en: { greet: "Hello {name}" } } });

    const result = i18n.tRaw("greet", { name: forged(json) });

    expect(result).toBe("Hello [object Object]");
  });

  it.each(FORGED_SHAPES)("%s inside an array param → rendered as text", (_label, json) => {
    const i18n = new I18n({ locale: "en", messages: { en: { greet: "Hello {names}" } } });

    const result = i18n.tRaw("greet", { names: [forged(json)] });

    expect(result).toBe("Hello [object Object]");
  });

  it("a forged node as a tag's content → the handler's element holds only text", () => {
    const i18n = new I18n({ locale: "en", messages: { en: { greet: "<b>{name}</b>" } } });

    const { content } = prepareTranslation(i18n, {
      i18nKey: "greet",
      params: { name: forged(FORGED_SHAPES[0][1]) },
      components: { b: "strong" },
    });

    expect(content).toEqual([createElement("strong", undefined, ["[object Object]"])]);
  });
});

describe("isVirtualNode() with an object the library did not create", () => {
  it.each(FORGED_SHAPES)("%s parsed from JSON → false", (_label, json) => {
    expect(isVirtualNode(forged(json))).toBe(false);
  });

  it("a node that went through JSON → false", () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(createElement("b", {}, ["x"])));

    expect(isVirtualNode(roundTripped)).toBe(false);
  });

  it("a node that went through structuredClone → false", () => {
    expect(isVirtualNode(structuredClone(createElement("b", {}, ["x"])))).toBe(false);
  });
});

describe("a param or tag named like an Object.prototype member", () => {
  it.each(["constructor", "valueOf", "toString", "hasOwnProperty"])(
    "{%s} with no such param → the literal placeholder",
    (name) => {
      const i18n = new I18n({ locale: "en", messages: { en: { msg: `a {${name}} b` } } });

      const result = i18n.tRaw("msg", { other: 1 } as never);

      expect(result).toBe(`a {${name}} b`);
    },
  );

  it.each(["constructor", "valueOf", "toString"])(
    "<%s> with no such handler → the tag's inner text",
    (name) => {
      const i18n = new I18n({
        locale: "en",
        messages: { en: { msg: `a <${name}>x</${name}> b` } },
      });

      const { content } = prepareTranslation(i18n, { i18nKey: "msg", params: { other: 1 } });

      expect(content).toBe("a x b");
    },
  );
});
