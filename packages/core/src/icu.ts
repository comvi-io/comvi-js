// @comvi/core/icu — pure, side-effect-free subpath.
//
// The ONLY public home of the ICU message compiler. Deliberately not exported
// from the root: the root entry is side-effectful (ambient tag registration),
// so importing `icuCompiler` from there would drag the tag graph and ambient
// tag semantics into slim+ICU apps. This subpath stays out of the package
// `sideEffects` array forever.
export { icuCompiler } from "./core/translate/compile-icu";
export type { MessageCompiler } from "./core/translate/syntax";
