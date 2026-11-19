export {
  collectElementAttributes,
  collectAllDescendantNodes,
  createTreeWalker,
  isNodeContainedIn,
  isAttributeAffectedByNodes,
  getNearestElementNode,
  findCorrespondingNode,
} from "./domHelpers";

export { debounce, type DebouncedFunction } from "./debounce";

export { removeInvisibleCharacters } from "./encoding";

export {
  createShadowDomContainer,
  removeShadowDomContainer,
  type ShadowDomContainer,
} from "./shadowDom";
