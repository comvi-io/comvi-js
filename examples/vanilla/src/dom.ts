import type { TranslationResult } from "@comvi/core";

/** `h("p", { class: "x" }, child, …)`: just enough of a DOM builder for one page. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.append(...children);
  return element;
}

/**
 * Rich text without a framework: `tRaw()` returns virtual nodes, and this turns
 * them into DOM nodes. A framework binding's `<T>` does the same for you.
 */
export function toDom(result: TranslationResult): Node[] {
  const parts = typeof result === "string" ? [result] : result;
  return parts.map((part) => {
    if (typeof part === "string") return document.createTextNode(part);
    if (part.type === "text") return document.createTextNode(part.text);
    if (part.type === "fragment") {
      const fragment = document.createDocumentFragment();
      fragment.append(...toDom(part.children));
      return fragment;
    }
    const element = document.createElement(part.tag);
    for (const [key, value] of Object.entries(part.props)) {
      element.setAttribute(key, String(value));
    }
    element.append(...toDom(part.children));
    return element;
  });
}
