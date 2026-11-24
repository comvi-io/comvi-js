import { describe, it, expect, afterEach } from "vitest";
import {
  collectAllDescendantNodes,
  collectElementAttributes,
  isAttributeAffectedByNodes,
} from "../src/utils/domHelpers";
import { cleanupDOM } from "./helpers";

afterEach(() => {
  cleanupDOM();
});

describe("collectElementAttributes()", () => {
  it("returns every attribute node of the element", () => {
    const element = document.createElement("input");
    element.setAttribute("placeholder", "Name");
    element.setAttribute("title", "Tooltip");

    const attributes = collectElementAttributes(element);

    expect(attributes.map((attr) => [attr.name, attr.value])).toEqual([
      ["placeholder", "Name"],
      ["title", "Tooltip"],
    ]);
  });

  it("returns an empty array for an element with no attributes", () => {
    expect(collectElementAttributes(document.createElement("div"))).toEqual([]);
  });
});

describe("collectAllDescendantNodes()", () => {
  it("collects the root, its descendants, their text nodes and their attributes", () => {
    const root = document.createElement("div");
    const child = document.createElement("span");
    child.setAttribute("title", "Tooltip");
    const text = document.createTextNode("hello");
    child.appendChild(text);
    root.appendChild(child);

    const collected = collectAllDescendantNodes(root);

    expect([...collected]).toEqual([root, child, child.getAttributeNode("title"), text]);
  });

  it("collects a DocumentFragment root without reading element-only properties", () => {
    const fragment = document.createDocumentFragment();
    const child = document.createElement("p");
    fragment.appendChild(child);

    const collected = collectAllDescendantNodes(fragment);

    expect([...collected]).toEqual([fragment, child]);
  });

  it("descends into the root element's own open shadow root", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const inner = document.createElement("b");
    shadowRoot.appendChild(inner);

    const collected = collectAllDescendantNodes(host);

    expect([...collected]).toEqual([host, shadowRoot, inner]);
  });

  it("descends into a descendant element's open shadow root", () => {
    const root = document.createElement("div");
    const host = document.createElement("section");
    root.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const inner = document.createElement("b");
    shadowRoot.appendChild(inner);

    const collected = collectAllDescendantNodes(root);

    expect([...collected]).toEqual([root, host, shadowRoot, inner]);
  });
});

describe("isAttributeAffectedByNodes()", () => {
  function attributeOn(tagName: string): Attr {
    const element = document.createElement(tagName);
    element.setAttribute("title", "value");
    return element.getAttributeNode("title")!;
  }

  it("reports affected when the attribute's own element is in the set", () => {
    const attr = attributeOn("div");

    expect(isAttributeAffectedByNodes(attr, new Set([attr.ownerElement!]))).toBe(true);
  });

  it("reports affected when an ancestor of the attribute's element is in the set", () => {
    const attr = attributeOn("div");
    const ancestor = document.createElement("section");
    ancestor.appendChild(attr.ownerElement!);

    expect(isAttributeAffectedByNodes(attr, new Set([ancestor]))).toBe(true);
  });

  it("reports unaffected when the set holds only unrelated elements", () => {
    const attr = attributeOn("div");

    expect(isAttributeAffectedByNodes(attr, new Set([document.createElement("aside")]))).toBe(
      false,
    );
  });

  it("reports unaffected for an attribute that has no owner element", () => {
    const detached = document.createAttribute("title");

    expect(isAttributeAffectedByNodes(detached, new Set([document.createElement("div")]))).toBe(
      false,
    );
  });

  it("reports unaffected when only a non-element container holds the owner", () => {
    const attr = attributeOn("div");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(attr.ownerElement!);

    expect(isAttributeAffectedByNodes(attr, new Set([fragment]))).toBe(false);
  });
});
