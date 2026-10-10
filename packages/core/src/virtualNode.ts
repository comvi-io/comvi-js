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
 * The mark of a node this library created. A symbol-keyed, non-enumerable
 * property: `JSON.parse` cannot produce it and neither `JSON.stringify` nor
 * `structuredClone` carries it, so an object that only LOOKS like a node —
 * data from an API response or a URL — never has it. `Symbol.for`, so two
 * copies of core in one app still recognise each other's nodes.
 */
const NODE_BRAND = Symbol.for("comvi.node");

function brand<T extends VirtualNode>(node: T): T {
  return Object.defineProperty(node, NODE_BRAND, { value: true });
}

/**
 * Type guard for the framework-agnostic VirtualNode union (strict: does NOT
 * accept Vue VNodes or React elements).
 *
 * True only for a node built by `createElement`, `createTextNode` or
 * `createFragment`. An object literal of the same shape is NOT a node: shape
 * is something untrusted data can have, and every `<T>` converter renders
 * whatever fails this guard as text.
 */
export function isVirtualNode(value: unknown): value is VirtualNode {
  return value != null && (value as { [NODE_BRAND]?: unknown })[NODE_BRAND] === true;
}

/** An array only when interpolation produced non-string content (components, elements). */
export type TranslationResult = string | Array<string | VirtualNode>;

export function createTextNode(text: string): TextNode {
  return brand({ type: "text", text });
}

export function createElement(
  tag: string,
  props?: Record<string, unknown>,
  children?: Array<VirtualNode | string>,
): ElementNode {
  return brand({
    type: "element",
    tag,
    props: props ?? {},
    children: children ?? [],
  });
}

export function createFragment(
  children: Array<VirtualNode | string>,
  key?: string | number,
): FragmentNode {
  return brand({ type: "fragment", children, key });
}
