/** Lives here, not next to its users, to avoid a circular import.
 *
 * Data stored for each tracked node — a text node or an attribute. */
export interface NodeData extends KeyInfo {
  textPreview?: string; // Visible text the frame marks (frames stripped, nothing else)
  /**
   * The text node holding the closing frame of a rich pair that spans nodes: the
   * translation's extent is the nodes from this node to that one, in document order.
   */
  close?: Text;
  /**
   * Set only when the node carries more than one distinct key: every
   * (inst, ns, key) in document order, each with the visible text it marks.
   * `inst`, `key`, `ns` and `textPreview` repeat the first entry.
   */
  markers?: NodeData[];
}

export interface ElementData {
  nodes: Map<Node | Attr, NodeData>;
}

export interface KeyInfo {
  /**
   * The editor-internal instance id of the frame: empty (or absent) while the page has one
   * instance.
   */
  inst?: string;
  key: string;
  ns: string;
}
