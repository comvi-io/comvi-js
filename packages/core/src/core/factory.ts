import type { DefaultTranslationParams, I18nOptions } from "../types";
import { I18n } from "./i18n";
import type { MessageCompiler } from "./translate/syntax";

/**
 * Options accepted by factory-created `createI18n` functions: the entry's
 * default compiler can be overridden per instance (e.g. inject `icuCompiler`
 * from `@comvi/core/icu` into the slim entry).
 */
export type FactoryI18nOptions<D extends DefaultTranslationParams = {}> = I18nOptions<D> & {
  compiler?: MessageCompiler;
};

/**
 * Build a `createI18n` bound to a message compiler. The `I18n` class keeps
 * its shape; the compiler arrives via constructor injection, so each entry
 * point (root/ICU, slim/simple) shares every non-compiler byte.
 */
export function createI18nWithCompiler(defaultCompiler: MessageCompiler) {
  return function createI18n<const D extends DefaultTranslationParams = {}>(
    options: FactoryI18nOptions<D>,
  ): I18n<D> {
    return new I18n<D>(options, options.compiler ?? defaultCompiler);
  };
}
