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
// `@comvi/core/tags`, which imports registration and then re-exports
// everything below unchanged so the ambient API stays source-compatible.
// `tests/features/rich-text-entry.test.ts` pins both halves.

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

// VirtualNode toolbox for rich-text consumers
export { createElement, createTextNode, createFragment, isVirtualNode } from "./virtualNode";
export type {
  VirtualNode,
  ElementNode,
  TextNode,
  FragmentNode,
  TranslationResult,
} from "./virtualNode";
