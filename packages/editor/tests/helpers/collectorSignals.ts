/**
 * Fixtures for the collector/signals suites: elements with a known box and
 * key metadata, ancestor chains built without the HTML parser, and boxes
 * centred on a given point.
 */
import { extractSemanticSignals } from "../../src/collector/signals";
import type { ElementWithMeta, SemanticSignals } from "../../src/collector/types";
import { mockBoundingClientRect } from "../helpers";

export function withMeta(
  element: Element,
  namespace: string,
  key: string,
  rect: Partial<DOMRect>,
  readingOrderIndex = 0,
): ElementWithMeta & { semantic: SemanticSignals } {
  mockBoundingClientRect(element, rect);
  const r = element.getBoundingClientRect();
  return {
    element,
    namespace,
    key,
    rect: r,
    centerPoint: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    readingOrderIndex,
    semantic: extractSemanticSignals(element),
  };
}

/**
 * Builds `tags[0] > tags[1] > … > innermost` with createElement, not innerHTML:
 * the HTML parser hoists a <button> out of a <table>, which would silently
 * change the ancestry under test.
 */
export function buildChain(...tags: string[]): HTMLElement {
  const nodes = tags.map((tag) => document.createElement(tag));
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i]!.appendChild(nodes[i + 1]!);
  }
  document.body.appendChild(nodes[0]!);
  return nodes[nodes.length - 1]!;
}

/** A 20x10 box whose centre point is exactly (centerX, centerY). */
export function boxAt(centerX: number, centerY: number): Partial<DOMRect> {
  return {
    left: centerX - 10,
    right: centerX + 10,
    top: centerY - 5,
    bottom: centerY + 5,
    width: 20,
    height: 10,
  };
}
