// @comvi/core/icu — pure, side-effect-free subpath.
//
// The ONLY public home of the ICU message compiler. ICU is a compiler setting,
// so there is exactly one way to enable it, for every catalog source (inline,
// loader, CDN, API):
//
//   createI18n({ locale: "en", compiler: icuCompiler }).with(fetchLoader({ … }))
//
// No ordering rule comes with it: the option is read in the constructor, so
// composition (`.with(loader())`, `.with(plugins())`, …) is unaffected.
//
// Deliberately not exported from the root, which is the BASE host with the
// simple compiler. This subpath must stay out of the package `sideEffects`
// array.
export { icuCompiler } from "./core/translate/compile-icu";
export type { MessageCompiler } from "./core/translate/syntax";
