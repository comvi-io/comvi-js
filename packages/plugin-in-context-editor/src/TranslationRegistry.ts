/**
 * TranslationRegistry - Central registry for translated elements
 *
 * Manages the mapping between DOM elements and their translation data.
 * This class:
 * - Uses EventBus for decoupling from ElementHighlighter
 * - Has proper lifecycle management (destroy method)
 * - Uses shared utility functions
 */

import { EventBus } from "./EventBus";
import type { ElementData, NodeData } from "./types/translation";
import { isNodeContainedIn, isAttributeAffectedByNodes } from "./utils/domHelpers";

// Re-export types for convenience
export type { ElementData, NodeData };

/**
 * Registry for tracking translated elements and their translation data
 * Emits events for UI components to react to changes
 */
export class TranslationRegistry {
  private elements: Map<Element, ElementData> = new Map();

  constructor(private eventBus: EventBus) {}

  /**
   * Adds a new element and its translation data to the registry
   * @param element - The Element to add
   * @param data - The translation data associated with the element
   * @throws {Error} If the element is null or undefined
   */
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

  /**
   * Removes an element and its associated translation data from the registry
   * @param element - The Element to remove
   * @throws {Error} If the element is null or undefined
   */
  public remove(element: Element): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    if (this.elements.has(element)) {
      this.elements.delete(element);
      this.eventBus.emit("translationRemoved", element);
    }
  }

  /**
   * Adds or updates translation data for an element
   * @param element - The Element to add or update
   * @param data - The new translation data to merge with existing data
   * @throws {Error} If the element is null or undefined
   */
  public addOrUpdate(element: Element, data: ElementData): void {
    if (!element) {
      throw new Error("Element cannot be null or undefined");
    }

    if (this.elements.has(element)) {
      const existingData = this.elements.get(element)!;
      // Merge the new nodes into existing nodes
      data.nodes.forEach((value, key) => {
        existingData.nodes.set(key, value);
      });
      this.eventBus.emit("translationUpdated", element, existingData);
    } else {
      this.add(element, data);
    }
  }

  /**
   * Gets the translation data for a specific element
   * @param element - The HTML element to get data for
   * @returns The translation data for the element, or undefined if not found
   */
  public get(element: Element): ElementData | undefined {
    return this.elements.get(element);
  }

  /**
   * Checks if an element exists in the registry
   * @param element - The HTML element to check
   * @returns True if the element exists in the registry
   */
  public has(element: Element): boolean {
    return this.elements.has(element);
  }

  /**
   * Clears all data from the registry
   * Emits translationRemoved for each element
   */
  public clear(): void {
    // Emit removal events before clearing
    for (const element of this.elements.keys()) {
      this.eventBus.emit("translationRemoved", element);
    }
    this.elements.clear();
  }

  /**
   * Gets the number of elements in the registry
   * @returns The number of elements in the registry
   */
  public size(): number {
    return this.elements.size;
  }

  /**
   * Gets all registered elements
   * @returns Iterator of all registered elements
   */
  public getElements(): IterableIterator<Element> {
    return this.elements.keys();
  }

  /**
   * Gets all entries (element -> data pairs)
   * @returns Iterator of all entries
   */
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

  /**
   * Removes multiple nodes from the translation registry and cleans up any empty elements
   * @param removedNodes - Set of nodes that were removed from the DOM
   */
  public cleanupRemovedNodes(removedNodes: Set<Node | Attr>): void {
    const removedNodeSet = new Set<Node>();
    for (const removedNode of removedNodes) {
      if (removedNode instanceof Node && !(removedNode instanceof Attr)) {
        removedNodeSet.add(removedNode);
      }
    }

    // First pass: identify elements to remove (those in removedNodes)
    const elementsToRemove: Element[] = [];

    for (const element of this.elements.keys()) {
      if (removedNodes.has(element)) {
        elementsToRemove.push(element);
      }
    }

    // Remove identified elements
    elementsToRemove.forEach((element) => this.remove(element));

    // Second pass: clean up references to removed nodes in remaining elements
    const elementsToCleanup: Element[] = [];

    for (const [element, data] of this.elements.entries()) {
      const nodesToRemove = Array.from(data.nodes.keys()).filter((node) =>
        this.isNodeAffectedByRemoval(node, removedNodes, removedNodeSet),
      );

      if (nodesToRemove.length > 0) {
        nodesToRemove.forEach((node) => data.nodes.delete(node));

        // If this was the last node for this element, mark for removal
        if (data.nodes.size === 0) {
          elementsToCleanup.push(element);
        } else {
          // Emit update event since nodes were removed
          this.eventBus.emit("translationUpdated", element, data);
        }
      }
    }

    // Remove elements that have no more nodes
    elementsToCleanup.forEach((element) => this.remove(element));
  }

  /**
   * Destroys the registry and cleans up resources
   */
  public destroy(): void {
    this.clear();
  }

  /**
   * Checks if a node is affected by the removal of any node in the removedNodes set
   */
  private isNodeAffectedByRemoval(
    node: Node | Attr,
    removedNodes: Set<Node | Attr>,
    removedNodeSet: Set<Node>,
  ): boolean {
    // Direct removal
    if (removedNodes.has(node)) {
      return true;
    }

    // Check if the node is contained within any removed node
    if (node instanceof Node && !(node instanceof Attr)) {
      if (isNodeContainedIn(node, removedNodeSet)) {
        return true;
      }
    }

    // Check if the node is an attribute and its owner element was removed
    if (node instanceof Attr) {
      if (isAttributeAffectedByNodes(node, removedNodes)) {
        return true;
      }
    }

    return false;
  }
}
