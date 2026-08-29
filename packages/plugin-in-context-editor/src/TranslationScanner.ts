/**
 * Listens for DOM change events and scans the affected nodes for translation
 * keys encoded as invisible characters.
 */

import type { TranslationSystemInnerOptions } from "./types";
import type { TranslationRegistry } from "./TranslationRegistry";
import { EventBus } from "./EventBus";
import { containsInvisibleCharacters, decodeInvisibleToKey } from "./translation";
import { IGNORED_NODES } from "./constants";
import {
  getNearestElementNode,
  findCorrespondingNode,
  removeInvisibleCharacters,
  createTreeWalker,
} from "./utils";

export class TranslationScanner {
  private eventBus: EventBus;
  private registry: TranslationRegistry;
  private options: TranslationSystemInnerOptions;
  private unsubscribers: (() => void)[] = [];

  constructor(
    eventBus: EventBus,
    registry: TranslationRegistry,
    options: TranslationSystemInnerOptions,
  ) {
    this.eventBus = eventBus;
    this.registry = registry;
    this.options = options;

    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    this.unsubscribers.push(
      this.eventBus.on("textChanges", (nodes: Node[]) => {
        nodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            this.processTextNode(node as Text);
          }
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("structureChanges", (nodes: Node[]) => {
        this.processStructureNodes(nodes);
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("attributeChanges", (elements: Element[]) => {
        elements.forEach((element) => {
          this.processAttributeNode(element);
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("initialScan", (root: Node) => {
        this.processStructureNode(root);
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on("nodesRemoved", (nodes: Node[]) => {
        this.processRemovedNodes(nodes);
      }),
    );
  }

  public destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private processRemovedNodes(nodes: Node[]): void {
    const removedNodesSet = new Set<Node | Attr>();
    nodes.forEach((node) => {
      if (node) {
        removedNodesSet.add(node);
      }
    });

    if (removedNodesSet.size > 0) {
      this.registry.cleanupRemovedNodes(removedNodesSet);
    }
  }

  private processTextNode(textNode: Text): void {
    const nearestElementNode = getNearestElementNode(textNode);
    if (!nearestElementNode) {
      return;
    }

    const correspondingNode = findCorrespondingNode(nearestElementNode);

    if (!correspondingNode) {
      return;
    }

    if (IGNORED_NODES.includes(correspondingNode.nodeName.toLowerCase())) {
      return;
    }

    const text = textNode.nodeValue;

    if (!text) {
      this.registry.removeNodesForElement(correspondingNode, (node) => node === textNode);
      return;
    }

    const decoded = decodeInvisibleToKey(text);
    if (decoded && typeof decoded === "object") {
      const { key, ns } = decoded;
      const textPreview = removeInvisibleCharacters(text);
      this.registry.addOrUpdate(correspondingNode, {
        nodes: new Map([[textNode, { key, ns, textPreview }]]),
      });
      return;
    }

    this.registry.removeNodesForElement(correspondingNode, (node) => node === textNode);
  }

  /** Tag-specific attributes plus the universal `*` entry. */
  private getAttributesToCheck(element: Element): string[] {
    const tagName = element.tagName.toLowerCase();
    const attributesToCheck = new Set<string>();

    Object.entries(this.options.tagAttributes).forEach(([selector, attrs]) => {
      if (selector === "*" || selector === tagName) {
        attrs.forEach((attr) => attributesToCheck.add(attr.toLowerCase()));
        return;
      }

      // Support CSS selector keys like "input[type=button]".
      try {
        if (element.matches(selector)) {
          attrs.forEach((attr) => attributesToCheck.add(attr.toLowerCase()));
        }
      } catch {
        // Ignore invalid selector rules instead of failing scanning.
      }
    });

    return Array.from(attributesToCheck);
  }

  private findEncodedAttributes(element: Element, attributeNames: string[]): Attr[] {
    return attributeNames
      .filter((attributeName) => element.hasAttribute(attributeName))
      .map((attributeName) => element.getAttributeNode(attributeName))
      .filter(
        (attributeNode): attributeNode is Attr =>
          attributeNode !== null && containsInvisibleCharacters(attributeNode.value),
      );
  }

  private processAttributeNode(element: Element): void {
    if (IGNORED_NODES.includes(element.tagName.toLowerCase())) {
      return;
    }

    const attributesToCheck = this.getAttributesToCheck(element);
    const matchingAttributes = this.findEncodedAttributes(element, attributesToCheck);
    const currentEncodedAttributesByName = new Map<string, Attr>();

    matchingAttributes.forEach((attribute) => {
      currentEncodedAttributesByName.set(attribute.name.toLowerCase(), attribute);
    });

    this.registry.removeNodesForElement(element, (node) => {
      if (!(node instanceof Attr)) {
        return false;
      }

      const attributeName = node.name.toLowerCase();
      if (!attributesToCheck.includes(attributeName)) {
        return false;
      }

      return currentEncodedAttributesByName.get(attributeName) !== node;
    });

    matchingAttributes.forEach((attribute) => {
      const decoded = decodeInvisibleToKey(attribute.value);
      if (decoded && typeof decoded === "object") {
        const { key, ns } = decoded;
        const textPreview = removeInvisibleCharacters(attribute.value);
        this.registry.addOrUpdate(element, {
          nodes: new Map([[attribute, { key, ns, textPreview }]]),
        });
      }
    });
  }

  private traverseAndProcessNodes(node: Node): void {
    const walker = createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        this.processTextNode(currentNode as Text);
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        this.processAttributeNode(currentNode as Element);
      }

      currentNode = walker.nextNode();
    }
  }

  private processStructureNode(node: Node): void {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      IGNORED_NODES.includes((node as Element).nodeName.toLowerCase())
    ) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      this.processAttributeNode(node as Element);
    }

    if (node.nodeType === Node.TEXT_NODE) {
      this.processTextNode(node as Text);
      return;
    }

    this.traverseAndProcessNodes(node);
  }

  private normalizeStructureRoots(nodes: Node[]): Node[] {
    const uniqueNodes = Array.from(new Set(nodes.filter(Boolean)));
    return uniqueNodes.filter((node) => {
      return !uniqueNodes.some((candidate) => candidate !== node && candidate.contains(node));
    });
  }

  private processStructureNodes(nodes: Node[]): void {
    this.normalizeStructureRoots(nodes).forEach((node) => {
      this.processStructureNode(node);
    });
  }
}
