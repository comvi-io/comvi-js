import type { VirtualNode } from "../../virtualNode";

/**
 * Check if value is a primitive (string, number, boolean, null, undefined, symbol, bigint).
 */
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

/**
 * Check if a value is a VirtualNode (framework-agnostic virtual node).
 * Also detects Vue VNodes and React elements for backward compatibility.
 */
export function isVNodeLoose(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;

  const node = value as Partial<VirtualNode>;
  const nodeType = node.type;
  if (nodeType === "element" || nodeType === "text" || nodeType === "fragment") {
    return true;
  }

  // Check for Vue VNode (backward compatibility)
  if ((value as any).__v_isVNode === true) {
    return true;
  }

  // Check for React elements (backward compatibility)
  if ((value as any).$$typeof) {
    return true;
  }

  return false;
}
