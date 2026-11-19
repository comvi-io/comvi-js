/**
 * Listens for DOM change events and scans the affected nodes for translation frames
 * (`./marker`: the format of editor plan §3.2).
 */

import type { TranslationSystemInnerOptions } from "./types";
import type { KeyInfo, NodeData } from "./types/translation";
import type { TranslationRegistry } from "./TranslationRegistry";
import { EventBus } from "./EventBus";
import { decodeFrames, stripFrames, FRAME_START, type Frame } from "./marker";
import { IGNORED_NODES } from "./constants";
import { getNearestElementNode, findCorrespondingNode, createTreeWalker } from "./utils";

interface DecodedMarker extends KeyInfo {
  inst: string;
  /** The visible text the frame marks. */
  textPreview: string;
  /** Offset of the frame's first character in the scanned text. */
  start: number;
  /** The text node holding the closing frame of a rich pair that spans nodes. */
  close?: Text;
}

const sameKey = (a: KeyInfo, b: KeyInfo): boolean =>
  (a.inst ?? "") === (b.inst ?? "") && a.ns === b.ns && a.key === b.key;

const preview = (text: string): string => stripFrames(text).trim();

/**
 * The text node of the closing frame that pairs with `open`, searched among the nodes that
 * follow `last` (the end of `open`'s text run) under the same parent — where a binding puts
 * the parts of one rich message — with the text in front of that frame. Same-payload pairs
 * nest.
 */
function findClose(open: KeyInfo, last: Text): { node: Text; before: string } | undefined {
  let depth = 0;
  let before = "";
  for (let sibling = last.nextSibling; sibling; sibling = sibling.nextSibling) {
    const texts: Text[] = [];
    if (sibling.nodeType === Node.TEXT_NODE) texts.push(sibling as Text);
    else {
      const walker = createTreeWalker(sibling, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
    }
    for (const text of texts) {
      const value = text.nodeValue ?? "";
      for (const frame of decodeFrames(value)) {
        if (!sameKey(frame, open)) continue;
        if (!frame.close) depth++;
        else if (depth-- === 0) return { node: text, before: before + value.slice(0, frame.start) };
      }
      before += value;
    }
  }
  return undefined;
}

/**
 * The frames of `text` (the whole run of `node`) whose opening or suffix frame starts in
 * [`from`, `to`). A frame closed by a later closing frame of the same run marks the text
 * between them; one closed in a later sibling marks the nodes up to it (`close`); an
 * unclosed one is a suffix marking the text since the previous frame.
 */
function decodeMarkers(text: string, from = 0, to = text.length, run?: Text[]): DecodedMarker[] {
  const frames = decodeFrames(text);
  const closedAt = new Map<Frame, Frame>();
  const stack: Frame[] = [];
  for (const frame of frames) {
    if (!frame.close) stack.push(frame);
    else {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (sameKey(stack[i]!, frame)) {
          closedAt.set(stack[i]!, frame);
          stack.length = i;
          break;
        }
      }
    }
  }

  const markers: DecodedMarker[] = [];
  let segmentStart = 0;
  for (const frame of frames) {
    if (frame.close) {
      segmentStart = frame.end;
      continue;
    }
    if (frame.start >= from && frame.start < to) {
      const { inst, ns, key } = frame;
      const pairedIn = closedAt.get(frame);
      const found = !pairedIn && run ? findClose(frame, run[run.length - 1]!) : undefined;
      markers.push({
        inst,
        ns,
        key,
        start: frame.start,
        close: found?.node,
        textPreview: pairedIn
          ? preview(text.slice(frame.end, pairedIn.start))
          : found
            ? preview(text.slice(frame.end) + found.before)
            : preview(text.slice(segmentStart, frame.start)),
      });
    }
    segmentStart = frame.end;
  }
  return markers;
}

/** The node's data, or null without markers. `wholePreview` keeps a lone key's preview. */
function toNodeData(markers: DecodedMarker[], wholePreview: string): NodeData | null {
  const distinct = markers.filter(
    (marker, index) => markers.findIndex((other) => sameKey(other, marker)) === index,
  );
  const first = distinct[0];
  if (!first) {
    return null;
  }
  const data = (m: DecodedMarker, textPreview = m.textPreview): NodeData => ({
    inst: m.inst,
    key: m.key,
    ns: m.ns,
    textPreview,
    ...(m.close ? { close: m.close } : {}),
  });
  if (distinct.length === 1) {
    return data(first, first.close ? first.textPreview : wholePreview);
  }
  return { ...data(first), markers: distinct.map((m) => data(m)) };
}

/** `textNode` and its adjacent text siblings, in document order. */
function textRun(textNode: Text): Text[] {
  let first: Node = textNode;
  while (first.previousSibling?.nodeType === Node.TEXT_NODE) {
    first = first.previousSibling;
  }
  const run: Text[] = [];
  for (
    let current: Node | null = first;
    current?.nodeType === Node.TEXT_NODE;
    current = current.nextSibling
  ) {
    run.push(current as Text);
  }
  return run;
}

/**
 * The markers that start in `textNode`. Adjacent text siblings are read as one string, so a
 * frame split across them still decodes, on the node where it starts.
 */
function decodeTextNodeMarkers(textNode: Text): DecodedMarker[] {
  let text = "";
  let nodeStart = 0;
  let nodeEnd = 0;
  const run = textRun(textNode);
  for (const current of run) {
    if (current === textNode) nodeStart = text.length;
    text += current.nodeValue ?? "";
    if (current === textNode) nodeEnd = text.length;
  }
  return decodeMarkers(text, nodeStart, nodeEnd, run);
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
        this.processTextRuns(
          nodes.filter((node): node is Text => node.nodeType === Node.TEXT_NODE),
        );
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

    const nodeData = toNodeData(decodeTextNodeMarkers(textNode), preview(text));
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
          attributeNode !== null && attributeNode.value.includes(FRAME_START),
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
      const nodeData = toNodeData(decodeMarkers(attribute.value), preview(attribute.value));
      if (nodeData) {
        this.registry.addOrUpdate(element, {
          nodes: new Map([[attribute, nodeData]]),
        });
      } else {
        // A frame start that no longer decodes: the same Attr stays on
        // the element, so it has to be dropped explicitly.
        this.registry.removeNodesForElement(element, (node) => node === attribute);
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
      this.processTextRuns([node as Text]);
      return;
    }

    this.traverseAndProcessNodes(node);
  }

  /**
   * Reconciles every node of each changed node's adjacent text run: a marker
   * can start in one node and end in the next, so a change to either one
   * changes what the other decodes to.
   */
  private processTextRuns(textNodes: Text[]): void {
    const processed = new Set<Text>();
    textNodes.forEach((textNode) => {
      textRun(textNode).forEach((member) => {
        if (!processed.has(member)) {
          processed.add(member);
          this.processTextNode(member);
        }
      });
    });
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
