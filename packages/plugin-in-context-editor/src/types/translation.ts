/**
 * Shared types for translation-related data structures
 * Centralized to avoid circular dependencies between modules
 */

/**
 * Data stored for each tracked node (text node or attribute)
 */
export interface NodeData {
  key: string;
  ns: string;
  textPreview?: string; // Visible text preview (invisible chars stripped)
}

/**
 * Data structure for an element containing translated content
 */
export interface ElementData {
  nodes: Map<Node | Attr, NodeData>;
}

/**
 * Information about a decoded translation key
 */
export interface KeyInfo {
  key: string;
  ns: string;
}
