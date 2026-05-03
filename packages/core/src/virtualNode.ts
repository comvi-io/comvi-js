/**
 * Framework-agnostic virtual node representation
 *
 * Discriminated union - each node type has exactly the fields it needs:
 * - ElementNode: HTML elements with tag, props, children
 * - TextNode: Plain text content
 * - FragmentNode: Grouping without wrapper element
 */

/** Element node: <tag props>children</tag> */
export interface ElementNode {
  type: "element";
  tag: string;
  props: Record<string, unknown>;
  children: Array<VirtualNode | string>;
  key?: string | number;
}

/** Text node: plain string content */
export interface TextNode {
  type: "text";
  text: string;
}

/** Fragment node: group children without wrapper */
export interface FragmentNode {
  type: "fragment";
  children: Array<VirtualNode | string>;
  key?: string | number;
}

/** Discriminated union of all virtual node types */
export type VirtualNode = ElementNode | TextNode | FragmentNode;

/**
 * Translation result can be a string or an array of strings and virtual nodes
 * This allows for interpolation with dynamic content (components, styled elements)
 */
export type TranslationResult = string | Array<string | VirtualNode>;

/**
 * Helper to create a text node
 */
export function createTextNode(text: string): TextNode {
  return { type: "text", text };
}

/**
 * Helper to create an element node
 */
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

/**
 * Helper to create a fragment node
 */
export function createFragment(
  children: Array<VirtualNode | string>,
  key?: string | number,
): FragmentNode {
  return { type: "fragment", children, key };
}
