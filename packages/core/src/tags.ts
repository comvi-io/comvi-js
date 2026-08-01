// @comvi/core/tags — tag interpolation toolbox (side-effectful entry).
//
// Importing this module registers tag syntax AMBIENTLY: plain string-API
// `t()` calls parse `<tag>...</tag>` everywhere afterwards. Component
// pipelines (`<T>` / prepareTranslation) do NOT rely on that: they pass
// `tagSyntaxExtension` per call via `tagInterpolation.extensions`, which is
// ordering-proof and immune to bundler side-effect stripping.
import "./register-tags";

export { registerTagSyntax, tagSyntaxExtension } from "./core/translate/tags";
export type { SyntaxExtension } from "./core/translate/syntax";

// T-core: the shared `<T>` pipeline (framework wrappers consume this)
export {
  prepareTranslation,
  getPendingHandlerName,
  childrenToArray,
} from "./core/prepareTranslation";
export type {
  PrepareTranslationProps,
  PrepareTranslationSource,
  PreparedTranslation,
  PendingHandler,
  TagComponentsMap,
  TagComponentConfig,
} from "./core/prepareTranslation";

// VirtualNode toolbox for tag consumers
export { createElement, createTextNode, createFragment, isVirtualNode } from "./virtualNode";
export type {
  VirtualNode,
  ElementNode,
  TextNode,
  FragmentNode,
  TranslationResult,
} from "./virtualNode";
