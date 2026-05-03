/**
 * Utility functions index
 *
 * Re-exports all utilities from their respective modules for convenient access.
 */

// DOM manipulation utilities
export {
  collectElementAttributes,
  collectAllDescendantNodes,
  createTreeWalker,
  isNodeContainedIn,
  isAttributeAffectedByNodes,
  getNearestElementNode,
  findCorrespondingNode,
} from "./domHelpers";

// Debounce utility
export { debounce, type DebouncedFunction } from "./debounce";

// Encoding utilities
export { removeInvisibleCharacters } from "./encoding";

// Shadow DOM utilities
export {
  createShadowDomContainer,
  removeShadowDomContainer,
  type ShadowDomContainer,
} from "./shadowDom";
