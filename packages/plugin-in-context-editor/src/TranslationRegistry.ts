/** Maps DOM elements to their translation data. */

import { EventBus } from "./EventBus";
import type { ElementData, NodeData } from "./types/translation";
import { isNodeContainedIn, isAttributeAffectedByNodes } from "./utils/domHelpers";

export type { ElementData, NodeData };

export class TranslationRegistry {
  private elements: Map<Element, ElementData> = new Map();

  constructor(private eventBus: EventBus) {}

  /** @throws {Error} If the element is null or undefined. */
  public add(element: Element, data: ElementData): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    if (this.elements.has(element)) {
      return;
    }

    this.elements.set(element, data);
    this.eventBus.emit("translationRegistered", element, data);
  }

  /** @throws {Error} If the element is null or undefined. */
  public remove(element: Element): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    if (this.elements.has(element)) {
      this.elements.delete(element);
      this.eventBus.emit("translationRemoved", element);
    }
  }

  /** Merges `data`'s nodes into any already tracked for the element.
   * @throws {Error} If the element is null or undefined.
   */
  public addOrUpdate(element: Element, data: ElementData): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    if (this.elements.has(element)) {
      const existingData = this.elements.get(element)!;
      data.nodes.forEach((value, key) => {
        existingData.nodes.set(key, value);
      });
      this.eventBus.emit("translationUpdated", element, existingData);
    } else {
      this.add(element, data);
    }
  }

  public get(element: Element): ElementData | undefined {
    return this.elements.get(element);
  }

  public has(element: Element): boolean {
    return this.elements.has(element);
  }

  /** Emits `translationRemoved` for every element before clearing. */
  public clear(): void {
    for (const element of this.elements.keys()) {
      this.eventBus.emit("translationRemoved", element);
    }
    this.elements.clear();
  }

  public size(): number {
    return this.elements.size;
  }

  public getElements(): IterableIterator<Element> {
    return this.elements.keys();
  }

  public entries(): IterableIterator<[Element, ElementData]> {
    return this.elements.entries();
  }

  /**
   * Removes tracked nodes for a specific element based on a predicate.
   * Used when DOM nodes remain attached but their encoded markers disappear.
   */
  public removeNodesForElement(
    element: Element,
    predicate: (node: Node | Attr, data: NodeData) => boolean,
  ): void {
    const data = this.elements.get(element);
    if (!data) {
      return;
    }

    let changed = false;

    for (const [node, nodeData] of Array.from(data.nodes.entries())) {
      if (predicate(node, nodeData)) {
        data.nodes.delete(node);
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    if (data.nodes.size === 0) {
      this.remove(element);
      return;
    }

    this.eventBus.emit("translationUpdated", element, data);
  }

  /** Elements left with no tracked nodes are removed too. */
  public cleanupRemovedNodes(removedNodes: Set<Node | Attr>): void {
    const removedNodeSet = new Set<Node>();
    for (const removedNode of removedNodes) {
      if (removedNode instanceof Node && !(removedNode instanceof Attr)) {
        removedNodeSet.add(removedNode);
      }
    }

    // First pass: elements that were themselves removed.
    const elementsToRemove: Element[] = [];

    for (const element of this.elements.keys()) {
      if (removedNodes.has(element)) {
        elementsToRemove.push(element);
      }
    }

    elementsToRemove.forEach((element) => this.remove(element));

    // Second pass: surviving elements that lost some of their nodes.
    const elementsToCleanup: Element[] = [];

    for (const [element, data] of this.elements.entries()) {
      const nodesToRemove = Array.from(data.nodes.keys()).filter((node) =>
        this.isNodeAffectedByRemoval(node, removedNodes, removedNodeSet),
      );

      if (nodesToRemove.length > 0) {
        nodesToRemove.forEach((node) => data.nodes.delete(node));

        if (data.nodes.size === 0) {
          elementsToCleanup.push(element);
        } else {
          this.eventBus.emit("translationUpdated", element, data);
        }
      }
    }

    elementsToCleanup.forEach((element) => this.remove(element));
  }

  public destroy(): void {
    this.clear();
  }

  private isNodeAffectedByRemoval(
    node: Node | Attr,
    removedNodes: Set<Node | Attr>,
    removedNodeSet: Set<Node>,
  ): boolean {
    if (removedNodes.has(node)) {
      return true;
    }

    if (node instanceof Node && !(node instanceof Attr)) {
      if (isNodeContainedIn(node, removedNodeSet)) {
        return true;
      }
    }

    // An Attr is affected when its OWNER element was removed.
    if (node instanceof Attr) {
      if (isAttributeAffectedByNodes(node, removedNodes)) {
        return true;
      }
    }

    return false;
  }
}
