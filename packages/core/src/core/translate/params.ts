import type { VirtualNode } from "../../virtualNode";

/** String, number, boolean, null, undefined, symbol or bigint. */
export function isPrimitive(val: unknown): boolean {
  const t = typeof val;
  return (
    t === "string" ||
    t === "number" ||
    t === "boolean" ||
    val == null ||
    t === "symbol" ||
    t === "bigint"
  );
}

/** LOOSE: a framework-agnostic VirtualNode, but also a Vue VNode or React element. */
export function isVNodeLoose(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;

  const node = value as Partial<VirtualNode>;
  const nodeType = node.type;
  if (nodeType === "element" || nodeType === "text" || nodeType === "fragment") {
    return true;
  }

  // Vue VNode.
  if ((value as any).__v_isVNode === true) {
    return true;
  }

  // React element.
  if ((value as any).$$typeof) {
    return true;
  }

  return false;
}
