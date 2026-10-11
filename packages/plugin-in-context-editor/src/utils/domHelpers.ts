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

/** Includes the root itself, element attributes, and open shadow roots. */
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

    collection.add(currentRoot);

    if (currentRoot.nodeType === Node.ELEMENT_NODE) {
      const rootElement = currentRoot as Element;
      collectElementAttributes(rootElement).forEach((attr) => collection.add(attr));
      if (rootElement.shadowRoot) {
        collectFromRoot(rootElement.shadowRoot);
      }
    }

    const walker = getDocumentForNode(currentRoot).createTreeWalker(
      currentRoot,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      collection.add(currentNode);

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

export function createTreeWalker(
  root: Node,
  whatToShow: number = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
): TreeWalker {
  return document.createTreeWalker(root, whatToShow, null);
}

export function isNodeContainedIn(node: Node, containerNodes: Set<Node>): boolean {
  for (const container of containerNodes) {
    if (container instanceof Node && container.contains(node)) {
      return true;
    }
  }
  return false;
}

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

/** Accepts any node kind — text, comment, attribute. */
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
 * `option`/`optgroup` must be highlighted on their parent `select`, so those
 * node names resolve to the parent; everything else resolves to itself.
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
