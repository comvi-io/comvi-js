import type { VirtualNode } from "@comvi/core";

export function isVirtualNode(value: unknown): value is VirtualNode {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value.type === "text" || value.type === "element" || value.type === "fragment")
  );
}
