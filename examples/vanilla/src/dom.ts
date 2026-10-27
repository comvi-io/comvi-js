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
 * Rich text without a framework: `t()` returns a string, or — when a tag handler
 * returned a DOM node — an array of strings and those nodes. A framework binding's
 * `<T>` does this for you.
 */
export function toDom(result: unknown): Array<Node | string> {
  return (Array.isArray(result) ? result : [result]).filter(
    (part): part is Node | string => typeof part === "string" || part instanceof Node,
  );
}
