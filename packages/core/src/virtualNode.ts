// Framework-agnostic virtual nodes: a discriminated union, so each node type
// carries exactly the fields it needs.

export interface ElementNode {
  type: "element";
  tag: string;
  props: Record<string, unknown>;
  children: Array<VirtualNode | string>;
  key?: string | number;
}

export interface TextNode {
  type: "text";
  text: string;
}

/** Groups children without a wrapper element. */
export interface FragmentNode {
  type: "fragment";
  children: Array<VirtualNode | string>;
  key?: string | number;
}

export type VirtualNode = ElementNode | TextNode | FragmentNode;

/**
 * Type guard for the framework-agnostic VirtualNode union (strict: does NOT
 * accept Vue VNodes or React elements).
 */
export function isVirtualNode(value: unknown): value is VirtualNode {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const type = value.type;
  return type === "element" || type === "text" || type === "fragment";
}

/** An array only when interpolation produced non-string content (components, elements). */
export type TranslationResult = string | Array<string | VirtualNode>;

export function createTextNode(text: string): TextNode {
  return { type: "text", text };
}

export function createElement(
  tag: string,
  props?: Record<string, unknown>,
  children?: Array<VirtualNode | string>,
): ElementNode {
  return {
    type: "element",
    tag,
    props: props ?? {},
    children: children ?? [],
  };
}

export function createFragment(
  children: Array<VirtualNode | string>,
  key?: string | number,
): FragmentNode {
  return { type: "fragment", children, key };
}
