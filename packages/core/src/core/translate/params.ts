import { isVirtualNode } from "../../virtualNode";

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

/**
 * LOOSE: a node this library created, or a React element.
 *
 * Never by shape alone. A param is application DATA — a name from an API, a
 * value from the URL — and data can be shaped like anything; only a mark that
 * cannot come out of `JSON.parse` separates a node from an object describing
 * one. Core's own nodes carry a symbol-keyed brand, and a React element's
 * `$$typeof` is a symbol for the same reason. A Vue VNode has no such mark
 * (`__v_isVNode` is a plain boolean), so it is data here, like any object.
 */
export function isVNodeLoose(value: unknown): boolean {
  return (
    isVirtualNode(value) ||
    (!!value &&
      typeof value === "object" &&
      typeof (value as { $$typeof?: unknown }).$$typeof === "symbol")
  );
}
