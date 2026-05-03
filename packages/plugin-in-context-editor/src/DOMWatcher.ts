/**
 * DOMWatcher - Observes DOM mutations and emits categorized events
 *
 * Uses MutationObserver to watch for changes in the target element
 * and its descendants. Categorizes mutations into text changes,
 * attribute changes, structure changes, and node removals.
 */

import type { TranslationSystemInnerOptions } from "./types";
import { EventBus } from "./EventBus";
import { collectAllDescendantNodes } from "./utils/domHelpers";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "./constants";

type ShadowRootAttachedListener = (host: Element, shadowRoot: ShadowRoot) => void;

const shadowRootAttachedListeners = new Set<ShadowRootAttachedListener>();
let restoreAttachShadowPatch: (() => void) | null = null;

function ensureAttachShadowPatched(): void {
  if (restoreAttachShadowPatch || typeof Element === "undefined") {
    return;
  }

  const prototype = Element.prototype as Element & {
    attachShadow?: (init: ShadowRootInit) => ShadowRoot;
  };
  const originalAttachShadow = prototype.attachShadow;

  if (!originalAttachShadow) {
    return;
  }

  prototype.attachShadow = function patchedAttachShadow(
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const shadowRoot = originalAttachShadow.call(this, init);
    shadowRootAttachedListeners.forEach((listener) => {
      try {
        listener(this, shadowRoot);
      } catch {
        // Never break host app attachShadow behavior because of observer callbacks.
      }
    });
    return shadowRoot;
  };

  restoreAttachShadowPatch = () => {
    prototype.attachShadow = originalAttachShadow;
  };
}

function subscribeToShadowRootAttached(listener: ShadowRootAttachedListener): () => void {
  shadowRootAttachedListeners.add(listener);
  ensureAttachShadowPatched();

  return () => {
    shadowRootAttachedListeners.delete(listener);
    if (shadowRootAttachedListeners.size === 0 && restoreAttachShadowPatch) {
      restoreAttachShadowPatch();
      restoreAttachShadowPatch = null;
    }
  };
}

export class DOMWatcher {
  private observers: Map<Node, MutationObserver> = new Map();
  private targetElement: Node;
  private eventBus: EventBus;
  private options: TranslationSystemInnerOptions;
  private isObserving: boolean = false;
  private readonly attributeFilter: string[];
  private detachShadowRootAttachedListener: (() => void) | null = null;

  constructor(eventBus: EventBus, options: TranslationSystemInnerOptions) {
    this.eventBus = eventBus;
    this.options = options;
    this.targetElement = options.targetElement || document;
    this.attributeFilter = this.buildAttributeFilter();
  }

  public start(): void {
    if (this.isObserving || typeof MutationObserver === "undefined") {
      return;
    }

    this.isObserving = true;
    this.detachShadowRootAttachedListener = subscribeToShadowRootAttached(
      (host: Element, shadowRoot: ShadowRoot) => {
        this.handleShadowRootAttached(host, shadowRoot);
      },
    );
    const roots = this.collectObservationRoots(this.targetElement);
    roots.forEach((root) => {
      this.observeRoot(root);
    });

    this.scanInitialDOM(roots);
  }

  public stop(): void {
    if (!this.isObserving) {
      return;
    }

    this.observers.forEach((observer) => {
      observer.disconnect();
    });
    this.observers.clear();
    if (this.detachShadowRootAttachedListener) {
      this.detachShadowRootAttachedListener();
      this.detachShadowRootAttachedListener = null;
    }
    this.isObserving = false;
  }

  private buildAttributeFilter(): string[] {
    const attributesToWatch = new Set<string>();

    if (this.options.tagAttributes) {
      Object.values(this.options.tagAttributes).forEach((attrs) => {
        attrs.forEach((attr) => attributesToWatch.add(attr.toLowerCase()));
      });
    }

    return [...attributesToWatch];
  }

  private observeRoot(root: Node): boolean {
    if (
      root.nodeType !== Node.DOCUMENT_NODE &&
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return false;
    }

    if (this.observers.has(root)) {
      return false;
    }

    const observer = new MutationObserver(this.handleMutations);
    observer.observe(root, {
      attributes: true,
      attributeFilter: this.attributeFilter,
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.observers.set(root, observer);
    return true;
  }

  private unobserveRoot(root: Node): void {
    const observer = this.observers.get(root);
    if (!observer) {
      return;
    }

    observer.disconnect();
    this.observers.delete(root);
  }

  private getDocumentForNode(node: Node): Document {
    if (node.nodeType === Node.DOCUMENT_NODE) {
      return node as Document;
    }
    return node.ownerDocument || document;
  }

  private isEditorUiShadowHost(element: Element): boolean {
    return element.hasAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE);
  }

  private isNodeWithinTargetScope(node: Node): boolean {
    if (this.targetElement.nodeType === Node.DOCUMENT_NODE) {
      return node.ownerDocument === this.targetElement;
    }

    if (node === this.targetElement) {
      return true;
    }

    return typeof this.targetElement.contains === "function" && this.targetElement.contains(node);
  }

  private handleShadowRootAttached(host: Element, shadowRoot: ShadowRoot): void {
    if (!this.isObserving) {
      return;
    }

    if (this.isEditorUiShadowHost(host) || !this.isNodeWithinTargetScope(host)) {
      return;
    }

    if (this.observeRoot(shadowRoot)) {
      this.emitInitialScans([shadowRoot]);
    }
  }

  private collectOpenShadowRoots(root: Node): ShadowRoot[] {
    const shadowRoots: ShadowRoot[] = [];
    if (
      root.nodeType !== Node.DOCUMENT_NODE &&
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return shadowRoots;
    }

    const maybeCollectShadowRoot = (element: Element) => {
      if (!element.shadowRoot || this.isEditorUiShadowHost(element)) {
        return;
      }
      shadowRoots.push(element.shadowRoot);
    };

    if (root.nodeType === Node.ELEMENT_NODE) {
      maybeCollectShadowRoot(root as Element);
    }

    const treeWalker = this.getDocumentForNode(root).createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
    );
    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      maybeCollectShadowRoot(currentNode as Element);
      currentNode = treeWalker.nextNode();
    }

    return shadowRoots;
  }

  private collectObservationRoots(root: Node): Node[] {
    const roots: Node[] = [];
    const visited = new Set<Node>();
    const queue: Node[] = [root];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      roots.push(current);

      const openShadowRoots = this.collectOpenShadowRoots(current);
      openShadowRoots.forEach((shadowRoot) => {
        if (!visited.has(shadowRoot)) {
          queue.push(shadowRoot);
        }
      });
    }

    return roots;
  }

  private observeShadowRootsInSubtree(node: Node, newlyObservedRoots: Set<Node>): void {
    const discoveredRoots = this.collectObservationRoots(node);
    discoveredRoots.forEach((root) => {
      if (root === node) {
        return;
      }
      if (this.observeRoot(root)) {
        newlyObservedRoots.add(root);
      }
    });
  }

  private unobserveRootsInRemovedSubtree(node: Node): void {
    const removedRoots = this.collectObservationRoots(node);
    removedRoots.forEach((removedRoot) => {
      if (removedRoot !== this.targetElement) {
        this.unobserveRoot(removedRoot);
      }
    });
  }

  /**
   * Categorizes text changes from a mutation
   */
  private categorizeTextChanges(mutation: MutationRecord, textChanges: Set<Node>): void {
    if (mutation.type === "characterData") {
      textChanges.add(mutation.target);
    }
  }

  /**
   * Categorizes attribute changes from a mutation
   */
  private categorizeAttributeChanges(
    mutation: MutationRecord,
    attributeChanges: Set<Element>,
  ): void {
    if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
      attributeChanges.add(mutation.target as Element);
    }
  }

  /**
   * Categorizes structure changes (added/removed nodes) from a mutation
   * Uses shared utility for collecting descendant nodes
   */
  private categorizeStructureChanges(
    mutation: MutationRecord,
    structureChanges: Set<Node>,
    removedNodes: Set<Node>,
    newlyObservedRoots: Set<Node>,
  ): void {
    if (mutation.type === "childList") {
      structureChanges.add(mutation.target);

      mutation.addedNodes.forEach((node) => {
        structureChanges.add(node);
        this.observeShadowRootsInSubtree(node, newlyObservedRoots);
      });

      mutation.removedNodes.forEach((node) => {
        removedNodes.add(node);
        this.unobserveRootsInRemovedSubtree(node);
        // Use shared utility to collect all descendant nodes
        const descendants = collectAllDescendantNodes(node);
        descendants.forEach((descendant) => {
          if (descendant instanceof Node) {
            removedNodes.add(descendant);
          }
        });
      });
    }
  }

  /**
   * Emits batched changes to the event bus
   * Only emits events for non-empty change sets
   */
  private emitBatchedChanges(
    textChanges: Set<Node>,
    attributeChanges: Set<Element>,
    structureChanges: Set<Node>,
    removedNodes: Set<Node>,
    newlyObservedRoots: Set<Node>,
  ): void {
    if (textChanges.size > 0) {
      this.eventBus.emit("textChanges", Array.from(textChanges));
    }

    if (attributeChanges.size > 0) {
      this.eventBus.emit("attributeChanges", Array.from(attributeChanges));
    }

    if (structureChanges.size > 0) {
      this.eventBus.emit("structureChanges", Array.from(structureChanges));
    }

    if (removedNodes.size > 0) {
      this.eventBus.emit("nodesRemoved", Array.from(removedNodes));
    }

    if (newlyObservedRoots.size > 0) {
      this.emitInitialScans(Array.from(newlyObservedRoots));
    }
  }

  private handleMutations = (mutations: MutationRecord[]) => {
    if (!this.isObserving) {
      return;
    }

    const textChanges = new Set<Node>();
    const attributeChanges = new Set<Element>();
    const structureChanges = new Set<Node>();
    const removedNodes = new Set<Node>();
    const newlyObservedRoots = new Set<Node>();

    // Categorize all mutations
    mutations.forEach((mutation) => {
      this.categorizeTextChanges(mutation, textChanges);
      this.categorizeAttributeChanges(mutation, attributeChanges);
      this.categorizeStructureChanges(mutation, structureChanges, removedNodes, newlyObservedRoots);
    });

    // Emit batched changes
    this.emitBatchedChanges(
      textChanges,
      attributeChanges,
      structureChanges,
      removedNodes,
      newlyObservedRoots,
    );
  };

  private emitInitialScans(roots: Node[]): void {
    roots.forEach((root) => {
      this.eventBus.emit("initialScan", root);
    });
  }

  private scanInitialDOM(roots: Node[]): void {
    if (!this.targetElement) {
      console.warn("Target element not available for initial scan");
      return;
    }

    const targetDocument = this.getDocumentForNode(this.targetElement);

    if (targetDocument.readyState === "loading") {
      targetDocument.addEventListener(
        "DOMContentLoaded",
        () => {
          this.emitInitialScans(roots);
        },
        { once: true },
      );
    } else {
      this.emitInitialScans(roots);
    }
  }
}
