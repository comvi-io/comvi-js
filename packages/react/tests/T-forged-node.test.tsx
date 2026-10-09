/**
 * A param is DATA until the library or React itself made it a node. An object
 * that only looks like one — what `JSON.parse` of an API response or a URL
 * parameter produces — must render as text, never as an element carrying the
 * sender's tag and props.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { createElement } from "@comvi/core";
import { createI18n } from "../src/index";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

const forged = (json: string): never => JSON.parse(json) as never;

const FORGED_SHAPES = [
  [
    "an element node",
    '{"type":"element","tag":"img","props":{"src":"x","data-forged":"1"},"children":[]}',
  ],
  [
    "a fragment node",
    '{"type":"fragment","children":[{"type":"element","tag":"img","props":{"data-forged":"1"},"children":[]}]}',
  ],
  ["a React element", '{"$$typeof":"react.element","type":"img","props":{"data-forged":"1"}}'],
] as const;

const renderT = (messages: Record<string, string>, ui: React.ReactElement) => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false, messages: { en: messages } });
  return render(
    <I18nProvider i18n={i18n} autoInit={false}>
      {ui}
    </I18nProvider>,
  ).container;
};

describe("<T /> with a param that only looks like a node", () => {
  it.each(FORGED_SHAPES)("%s parsed from JSON → rendered as text", (_label, json) => {
    const container = renderT(
      { greeting: "Hello {name}" },
      <T i18nKey="greeting" name={forged(json)} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-forged]")).toBeNull();
    expect(container.textContent).toBe("Hello [object Object]");
  });

  it.each(FORGED_SHAPES)("%s inside a tag handler's content → rendered as text", (_label, json) => {
    const container = renderT(
      { greeting: "Hello <b>{name}</b>" },
      <T i18nKey="greeting" name={forged(json)} components={{ b: <strong /> }} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")!.textContent).toBe("[object Object]");
  });

  it("a forged node nested in a node the app built → rendered as text", () => {
    const built = createElement("span", {}, [forged(FORGED_SHAPES[0][1])]);

    const container = renderT({ greeting: "Hello {name}" }, <T i18nKey="greeting" name={built} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("span")!.textContent).toBe("[object Object]");
  });
});

describe("<T /> with a node the app passed deliberately", () => {
  it("a React element param → rendered as that element", () => {
    const container = renderT(
      { greeting: "Hello {name}" },
      <T i18nKey="greeting" name={<strong data-real="1">Ada</strong>} />,
    );

    expect(container.querySelector("strong[data-real]")!.textContent).toBe("Ada");
  });

  it("a createElement() node param → rendered as that element", () => {
    const container = renderT(
      { greeting: "Hello {name}" },
      <T i18nKey="greeting" name={createElement("em", { title: "t" }, ["Ada"])} />,
    );

    expect(container.querySelector("em[title='t']")!.textContent).toBe("Ada");
  });
});
