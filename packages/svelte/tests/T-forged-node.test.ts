/**
 * A param is DATA until the library itself made it a node. An object that only
 * looks like one — what `JSON.parse` of an API response or a URL parameter
 * produces — must render as text, never as an element carrying the sender's
 * tag and props.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import { createElement } from "@comvi/core";
import TDirectPropsWrapper from "./TDirectProps.test.svelte";
import { createI18n } from "../src/index";

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
] as const;

describe("T.svelte with a param that only looks like a node", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const mountT = (messages: Record<string, string>, direct: Record<string, unknown>) => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false, messages: { en: messages } });
    component = mount(TDirectPropsWrapper, { target, props: { i18n, i18nKey: "greet", direct } });
    return target.querySelector('[data-testid="t-direct-props"]')!;
  };

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  it.each(FORGED_SHAPES)("%s parsed from JSON → rendered as text", (_label, json) => {
    const root = mountT({ greet: "Hello {name}" }, { name: forged(json) });

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("[data-forged]")).toBeNull();
    expect(root.textContent?.trim()).toBe("Hello [object Object]");
  });

  it.each(FORGED_SHAPES)("%s inside a tag handler's content → rendered as text", (_label, json) => {
    const root = mountT(
      { greet: "Hello <b>{name}</b>" },
      { name: forged(json), components: { b: "strong" } },
    );

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("strong")!.textContent).toBe("[object Object]");
  });

  it("a forged node nested in a node the app built → rendered as text", () => {
    const built = createElement("span", {}, [forged(FORGED_SHAPES[0][1]) as never]);

    const root = mountT({ greet: "Hello {name}" }, { name: built });

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("span")!.textContent).toBe("[object Object]");
  });

  it("a createElement() node param → rendered as that element", () => {
    const root = mountT(
      { greet: "Hello {name}" },
      { name: createElement("em", { title: "t" }, ["Ada"]) },
    );

    expect(root.querySelector("em[title='t']")!.textContent).toBe("Ada");
  });
});
