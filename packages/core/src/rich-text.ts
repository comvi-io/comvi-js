// @comvi/core/rich-text — the PURE rich-text toolbox (zero side effects).
//
// This is the seam every framework `<T>` imports. It carries the shared
// prepareTranslation pipeline and the VirtualNode toolbox those components
// need, and it registers NOTHING: `prepareTranslation` hands the tag grammar
// to core through `tagInterpolation.extensions` on EVERY call, so a graph that
// only renders `<T>` never makes `<tag>` markup ambient for plain string-API
// `t()`.
//
// NEVER add `import "./register-tags"` (or any other module-level side effect)
// to this file. That import is the entire difference between this entry and
// `@comvi/core/tags`, which imports registration and then re-exports everything
// below unchanged so the ambient API stays source-compatible.
//
// `registerTagSyntax` IS exported below, but exporting the function is not
// calling it: nothing here invokes it at module scope, so importing this
// entry alone still registers nothing. It is re-exported so a reader who
// found this pure entry has an explicit, discoverable opt-in into the same
// ambient registration `@comvi/core/tags` performs at import time, without
// needing to know that second subpath exists.

export {
  prepareTranslation,
  getPendingHandlerName,
  childrenToArray,
} from "./core/prepareTranslation";
export { registerTagSyntax } from "./core/translate/tags";
export type {
  PrepareTranslationProps,
  PrepareTranslationSource,
  PreparedTranslation,
  PendingHandler,
  TagComponentsMap,
  TagComponentConfig,
} from "./core/prepareTranslation";

export { createElement, createTextNode, createFragment, isVirtualNode } from "./virtualNode";
export type {
  VirtualNode,
  ElementNode,
  TextNode,
  FragmentNode,
  TranslationResult,
} from "./virtualNode";
