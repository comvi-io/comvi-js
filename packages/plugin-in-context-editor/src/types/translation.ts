/** Lives here, not next to its users, to avoid a circular import.
 *
 * Data stored for each tracked node — a text node or an attribute. */
export interface NodeData {
  key: string;
  ns: string;
  textPreview?: string; // Visible text preview (invisible chars stripped)
  /**
   * Set only when the node carries more than one distinct key: every
   * (ns, key) in document order, each with the visible text in front of it.
   * `key`, `ns` and `textPreview` repeat the first entry.
   */
  markers?: Array<KeyInfo & { textPreview?: string }>;
}

export interface ElementData {
  nodes: Map<Node | Attr, NodeData>;
}

export interface KeyInfo {
  key: string;
  ns: string;
}
