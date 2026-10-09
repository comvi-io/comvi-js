/**
 * A param is DATA until the library itself made it a node. An object that only
 * looks like one — what `JSON.parse` of an API response or a URL parameter
 * produces — must render as text, never as an element carrying the sender's
 * tag and props.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createElement } from "@comvi/core";
import { createI18n } from "../src/createI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

const forged = (json: string): unknown => JSON.parse(json);

const FORGED_SHAPES = [
  [
    "an element node",
    '{"type":"element","tag":"img","props":{"src":"x","data-forged":"1"},"children":[]}',
  ],
  [
    "a fragment node",
    '{"type":"fragment","children":[{"type":"element","tag":"img","props":{"data-forged":"1"},"children":[]}]}',
  ],
  [
    "a Vue VNode",
    '{"__v_isVNode":true,"__v_skip":true,"type":"img","tag":"img","props":{"data-forged":"1"},"children":[],"shapeFlag":1,"patchFlag":0}',
  ],
] as const;

const mountT = (
  messages: Record<string, string>,
  props: { i18nKey: string } & Record<string, unknown>,
) => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false, messages: { en: messages } });
  return mount(T, { props, global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } } });
};

describe("<T /> with a param that only looks like a node", () => {
  it.each(FORGED_SHAPES)("%s parsed from JSON → rendered as text", (_label, json) => {
    const wrapper = mountT({ greet: "Hello {name}" }, { i18nKey: "greet", name: forged(json) });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("[data-forged]").exists()).toBe(false);
    expect(wrapper.text()).toBe("Hello [object Object]");
  });

  it.each(FORGED_SHAPES)("%s inside a tag handler's content → rendered as text", (_label, json) => {
    const wrapper = mountT(
      { greet: "Hello <b>{name}</b>" },
      { i18nKey: "greet", name: forged(json), components: { b: "strong" } },
    );

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("strong").text()).toBe("[object Object]");
  });

  it("a forged node nested in a node the app built → rendered as text", () => {
    const built = createElement("span", {}, [forged(FORGED_SHAPES[0][1]) as never]);

    const wrapper = mountT({ greet: "Hello {name}" }, { i18nKey: "greet", name: built });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("span").text()).toBe("[object Object]");
  });
});

describe("<T /> with a node the app passed deliberately", () => {
  it("a createElement() node param → rendered as that element", () => {
    const wrapper = mountT(
      { greet: "Hello {name}" },
      { i18nKey: "greet", name: createElement("em", { title: "t" }, ["Ada"]) },
    );

    expect(wrapper.find("em[title='t']").text()).toBe("Ada");
  });
});
