/** Lives here, not next to its users, to avoid a circular import.
 *
 * Data stored for each tracked node — a text node or an attribute. */
export interface NodeData {
  key: string;
  ns: string;
  textPreview?: string; // Visible text preview (invisible chars stripped)
}

export interface ElementData {
  nodes: Map<Node | Attr, NodeData>;
}

export interface KeyInfo {
  key: string;
  ns: string;
}
