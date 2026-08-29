// @comvi/core/tags — AMBIENT tag interpolation entry (side-effectful).
//
// Importing this module registers tag syntax AMBIENTLY: plain string-API `t()`
// calls parse `<tag>...</tag>` everywhere afterwards. Component pipelines
// (`<T>` / prepareTranslation) do NOT rely on that — they pass
// `tagSyntaxExtension` per call, which is ordering-proof and immune to bundler
// side-effect stripping. That is why the pure half of this surface lives in its
// own entry, `@comvi/core/rich-text`, which framework `<T>` imports instead.
import "./register-tags";

export { registerTagSyntax, tagSyntaxExtension } from "./core/translate/tags";
export type { SyntaxExtension } from "./core/translate/syntax";

// A star re-export, never a hand-kept copy of the list: this entry must stay a
// source-compatible superset of `./rich-text`, and the two must never drift.
export * from "./rich-text";
