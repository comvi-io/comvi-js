import { TK_PARAM, type ParsedToken } from "./cache";
import type { MessageCompiler } from "./syntax";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * Structured failure raised when ICU argument syntax reaches the simple
 * compiler (Policy A: loud in dev AND prod).
 *
 * Own fields are exactly `code` and `argumentType`. Locale, namespace, key and
 * catalog source are APPLICATION-supplied telemetry, never core-error fields.
 */
export interface IcuSyntaxError extends Error {
  code: "E_ICU_SYNTAX";
  argumentType: string;
}

/**
 * The default message compiler: text + `{param}` interpolation only.
 *
 * A comma inside parsed braces is the ICU argument-type marker
 * (`{name, plural, …}`) and THROWS `E_ICU_SYNTAX` in dev and prod.
 */
export const simpleCompiler: MessageCompiler = {
  cid: 1,
  makeArgToken(content: string, _hashIsSyntax: boolean, template: string): ParsedToken | undefined {
    const comma = content.indexOf(",");
    if (comma !== -1) {
      const argumentType = content
        .slice(comma + 1)
        .split(",", 1)[0]
        .trim();
      const error = new Error(
        IS_DEV
          ? `[i18n] "{${content}}" in "${template}" is ICU "${argumentType}" syntax; the default compiler supports {param} only. ` +
              (argumentType === "plural" ||
              argumentType === "select" ||
              argumentType === "selectordinal"
                ? `Use compiler: icuCompiler from "@comvi/core/icu" for inline catalogs, or .with(icu()) before any catalog is ingested for remote ones.`
                : `"${argumentType}" is not a shipped ICU argument type: quote the literal ('{…}') or pass your own compiler.`)
          : "E_ICU_SYNTAX",
      ) as IcuSyntaxError;
      error.code = "E_ICU_SYNTAX";
      error.argumentType = argumentType;
      throw error;
    }
    return [TK_PARAM, content.trim()];
  },
};
