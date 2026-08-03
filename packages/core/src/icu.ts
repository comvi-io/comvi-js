// @comvi/core/icu — pure, side-effect-free subpath.
//
// The ONLY public home of the ICU message compiler, plus the `icu()`
// installer for the remote-catalog recipe:
//
//   createI18n({ locale: "en" }).with(icu()).with(fetchLoader({ … }))
//
// PRE-INGESTION ONLY. Once a catalog has reached the host — a constructor
// `translation`, an `addTranslations` call, or a loader merge — the compiler
// is locked and `icu()` throws `E_COMPILER_LOCKED` BEFORE mutating anything.
// Inline constructor catalogs use the option form instead:
// `createI18n({ translation, compiler: icuCompiler })`.
//
// Deliberately not exported from the root: the root entry is the BASE host
// with the simple compiler, and ICU is an import you add — never an entry you
// switch. This subpath stays out of the package `sideEffects` array forever.
import type { I18n, I18nInternal } from "./core/i18n";
import { icuCompiler } from "./core/translate/compile-icu";
import type { MessageCompiler } from "./core/translate/syntax";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export { icuCompiler } from "./core/translate/compile-icu";
export type { MessageCompiler } from "./core/translate/syntax";

/** Structured failure raised when `icu()` runs after catalog ingestion. */
export interface CompilerLockedError extends Error {
  code: "E_COMPILER_LOCKED";
}

/**
 * Install an ICU-capable compiler on a host that has ingested NO catalog yet.
 * Idempotent before ingestion; throws `E_COMPILER_LOCKED` after it.
 */
export function icu(compiler: MessageCompiler = icuCompiler) {
  return <T extends I18n<any>>(i18n: T): T => {
    if (!(i18n as unknown as I18nInternal)._setCompilerBeforeIngestion(compiler)) {
      const error = new Error(
        IS_DEV
          ? "[i18n] .with(icu()) ran after a catalog was ingested. Move it before the first constructor/addTranslations/loader catalog, or pass compiler: icuCompiler to the constructor for inline catalogs."
          : "E_COMPILER_LOCKED",
      ) as CompilerLockedError;
      error.code = "E_COMPILER_LOCKED";
      throw error;
    }
    return i18n;
  };
}
