/**
 * Shared DOM utility functions for the in-context editor
 * Shared DOM utilities used by DOMWatcher, TranslationScanner, etc.
 */

/**
 * Collects all attributes from an element
 * @param element - The element to collect attributes from
 * @returns Array of Attr objects
 */
export function collectElementAttributes(element: Element): Attr[] {
  const attributes: Attr[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr) {
      attributes.push(attr);
    }
  }
  return attributes;
}

/**
 * Collects all descendant nodes (elements, text nodes, and their attributes)
 * from a root node using TreeWalker for efficient traversal
 *
 * @param root - The root node to start traversal from
 * @returns Set of all nodes and attributes found
 */
export function collectAllDescendantNodes(root: Node): Set<Node | Attr> {
  const collection = new Set<Node | Attr>();
  const visitedRoots = new Set<Node>();

  const getDocumentForNode = (node: Node): Document => {
    if (node.nodeType === Node.DOCUMENT_NODE) {
      return node as Document;
    }
    return node.ownerDocument || document;
  };

  const collectFromRoot = (currentRoot: Node) => {
    if (visitedRoots.has(currentRoot)) {
      return;
    }
    visitedRoots.add(currentRoot);

    // Add the root node itself
    collection.add(currentRoot);

    // If root is an element, add its attributes and traverse attached shadow root
    if (currentRoot.nodeType === Node.ELEMENT_NODE) {
      const rootElement = currentRoot as Element;
      collectElementAttributes(rootElement).forEach((attr) => collection.add(attr));
      if (rootElement.shadowRoot) {
        collectFromRoot(rootElement.shadowRoot);
      }
    }

    // Use TreeWalker for efficient traversal
    const walker = getDocumentForNode(currentRoot).createTreeWalker(
      currentRoot,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      collection.add(currentNode);

      // Add attributes for element nodes and traverse open shadow roots
      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const element = currentNode as Element;
        collectElementAttributes(element).forEach((attr) => collection.add(attr));
        if (element.shadowRoot) {
          collectFromRoot(element.shadowRoot);
        }
      }

      currentNode = walker.nextNode();
    }
  };

  collectFromRoot(root);

  return collection;
}

/**
 * Creates a TreeWalker with standard configuration
 * @param root - The root node to walk
 * @param whatToShow - NodeFilter constants for what to show
 * @returns Configured TreeWalker
 */
export function createTreeWalker(
  root: Node,
  whatToShow: number = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
): TreeWalker {
  return document.createTreeWalker(root, whatToShow, null);
}

/**
 * Checks if a node is contained within any of the nodes in a set
 * @param node - The node to check
 * @param containerNodes - Set of potential container nodes
 * @returns True if node is contained within any container
 */
export function isNodeContainedIn(node: Node, containerNodes: Set<Node>): boolean {
  for (const container of containerNodes) {
    if (container instanceof Node && container.contains(node)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an attribute's owner element is in the given set or contained by it
 * @param attr - The attribute to check
 * @param nodes - Set of nodes to check against
 * @returns True if the attribute's owner is affected
 */
export function isAttributeAffectedByNodes(attr: Attr, nodes: Set<Node | Attr>): boolean {
  const ownerElement = attr.ownerElement;
  if (!ownerElement) return false;

  for (const node of nodes) {
    if (node instanceof Element) {
      if (node === ownerElement || node.contains(ownerElement)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Gets the nearest Element Node ancestor for a given node
 * Works with text nodes, comment nodes, or any DOM node
 * Returns null if no element ancestor is found
 *
 * @param node - The node to find the nearest element ancestor for
 * @returns The nearest element ancestor or null
 */
export function getNearestElementNode(node: Node | null | undefined): Element | null {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  let currentNode: Node | null = node.parentNode;

  while (currentNode) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      return currentNode as Element;
    }
    currentNode = currentNode.parentNode;
  }

  return null;
}

/**
 * Finds the corresponding node for elements that should be processed at parent level
 * Used for option and optgroup elements which should be highlighted at the parent select level
 *
 * @param element - The element to find the corresponding node for
 * @param parentNodeNames - Array of node names that should return parent instead
 * @returns The corresponding node (parent for special nodes, self otherwise)
 */
export function findCorrespondingNode(
  element: Element,
  parentNodeNames: string[] = ["option", "optgroup"],
): Element | null {
  if (parentNodeNames.includes(element.nodeName.toLowerCase())) {
    return element.parentNode as Element;
  }
  return element;
}
