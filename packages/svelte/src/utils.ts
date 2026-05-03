import type { TranslationResult, VirtualNode } from "@comvi/core";

function virtualNodeToText(node: VirtualNode): string {
  if (node.type === "text") {
    return node.text;
  }

  let text = "";
  for (const child of node.children) {
    text += typeof child === "string" ? child : virtualNodeToText(child);
  }
  return text;
}

export function translationResultToString(result: TranslationResult): string {
  if (typeof result === "string") {
    return result;
  }

  let text = "";
  for (const part of result) {
    text += typeof part === "string" ? part : virtualNodeToText(part);
  }
  return text;
}
