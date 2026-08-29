// @comvi/core/tags — AMBIENT tag interpolation entry (side-effectful).
//
// Importing this module registers tag syntax AMBIENTLY: plain string-API
// `t()` calls parse `<tag>...</tag>` everywhere afterwards. Component
// pipelines (`<T>` / prepareTranslation) do NOT rely on that: they pass
// `tagSyntaxExtension` per call via `tagInterpolation.extensions`, which is
// ordering-proof and immune to bundler side-effect stripping — which is why
// the pure half of this surface now lives in its own entry
// (`@comvi/core/rich-text`) that framework `<T>` components import instead.
import "./register-tags";

export { registerTagSyntax, tagSyntaxExtension } from "./core/translate/tags";
export type { SyntaxExtension } from "./core/translate/syntax";

// The pure rich-text surface, re-exported verbatim so this entry stays the
// source-compatible superset it has always been: the T-core pipeline
// (prepareTranslation, getPendingHandlerName, childrenToArray, PendingHandler
// and friends) plus the VirtualNode toolbox. A star re-export, not a hand-kept
// copy of the list — the two surfaces must never drift.
export * from "./rich-text";
