/**
 * Listens for DOM change events and scans the affected nodes for translation
 * keys encoded as invisible characters.
 */

import type { TranslationSystemInnerOptions } from "./types";
import type { NodeData } from "./types/translation";
import type { TranslationRegistry } from "./TranslationRegistry";
import { EventBus } from "./EventBus";
import { containsInvisibleCharacters, decodeInvisibleToKey } from "./translation";
import { ENCODING_LENGTH, IGNORED_NODES, INVISIBLE_CHARS } from "./constants";
import {
  getNearestElementNode,
  findCorrespondingNode,
  removeInvisibleCharacters,
  createTreeWalker,
} from "./utils";

interface DecodedMarker {
  key: string;
  ns: string;
  /** The visible text between the previous marker and this one. */
  textPreview: string;
  /** Offset of the marker's first character in the scanned text. */
  start: number;
}

function isInvisibleChar(char: string): boolean {
  return (INVISIBLE_CHARS as readonly string[]).includes(char);
}

/**
 * Every whole marker in `text`. A run of invisible characters whose length is
 * not a multiple of ENCODING_LENGTH holds a fragment, and its alignment is
 * unknown, so the whole run decodes to nothing rather than to a wrong key.
 */
function decodeMarkers(text: string): DecodedMarker[] {
  const markers: DecodedMarker[] = [];
  let segmentStart = 0;
  let index = 0;
  while (index < text.length) {
    if (!isInvisibleChar(text[index]!)) {
      index++;
      continue;
    }
    const runStart = index;
    while (index < text.length && isInvisibleChar(text[index]!)) {
      index++;
    }
    if ((index - runStart) % ENCODING_LENGTH === 0) {
      const textPreview = text.slice(segmentStart, runStart).trim();
      for (let start = runStart; start < index; start += ENCODING_LENGTH) {
        const decoded = decodeInvisibleToKey(text.slice(start, start + ENCODING_LENGTH));
        if (decoded && typeof decoded === "object") {
          markers.push({ key: decoded.key, ns: decoded.ns, textPreview, start });
        }
      }
    }
    segmentStart = index;
  }
  return markers;
}

/** The node's data, or null without markers. `wholePreview` keeps a lone key's preview as before. */
function toNodeData(markers: DecodedMarker[], wholePreview: string): NodeData | null {
  const distinct = markers.filter(
    (marker, index) =>
      markers.findIndex((other) => other.key === marker.key && other.ns === marker.ns) === index,
  );
  const first = distinct[0];
  if (!first) {
    return null;
  }
  if (distinct.length === 1) {
    return { key: first.key, ns: first.ns, textPreview: wholePreview };
  }
  return {
    key: first.key,
    ns: first.ns,
    textPreview: first.textPreview,
    markers: distinct.map(({ key, ns, textPreview }) => ({ key, ns, textPreview })),
  };
}

/**
 * The markers that start in `textNode`. Adjacent text siblings are read as
 * one string, so a marker split across them still decodes, on the node where
 * it starts.
 */
function decodeTextNodeMarkers(textNode: Text): DecodedMarker[] {
  let first: Node = textNode;
  while (first.previousSibling?.nodeType === Node.TEXT_NODE) {
    first = first.previousSibling;
  }

  let text = "";
  let nodeStart = 0;
  let nodeEnd = 0;
  for (
    let current: Node | null = first;
    current?.nodeType === Node.TEXT_NODE;
    current = current.nextSibling
  ) {
    if (current === textNode) nodeStart = text.length;
    text += current.nodeValue ?? "";
    if (current === textNode) nodeEnd = text.length;
  }

  return decodeMarkers(text).filter(
    (marker) => marker.start >= nodeStart && marker.start < nodeEnd,
  );
}

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

    const nodeData = toNodeData(decodeTextNodeMarkers(textNode), removeInvisibleCharacters(text));
    if (nodeData) {
      this.registry.addOrUpdate(correspondingNode, {
        nodes: new Map([[textNode, nodeData]]),
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
      const nodeData = toNodeData(
        decodeMarkers(attribute.value),
        removeInvisibleCharacters(attribute.value),
      );
      if (nodeData) {
        this.registry.addOrUpdate(element, {
          nodes: new Map([[attribute, nodeData]]),
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
