import { TK_PARAM, type ParsedToken } from "./cache";
import type { MessageCompiler } from "./syntax";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * Structured failure raised when ICU argument syntax reaches the simple
 * compiler. Development throws it at ingestion; production renders the braced
 * segment literally and reports this shape through `onError` (or
 * `console.error`) on the compilation that hit it — best-effort, per process,
 * never on cached renders.
 *
 * Own fields are exactly `code` and `argumentType`. Locale, namespace, key and
 * catalog source are APPLICATION-supplied telemetry, never core-error fields:
 * they travel in the `ErrorReportContext` the instance attaches.
 */
export interface IcuSyntaxError extends Error {
  code: "E_ICU_SYNTAX";
  argumentType: string;
}

/**
 * The argument type of the most recent production ICU miss, waiting to be
 * read-and-cleared by the instance. Production only: the compiler cannot see
 * key/locale/namespace, so `I18n._translate` picks the hit up immediately
 * after the `translate()` call that produced it and attaches the telemetry.
 * @internal
 */
export let icuHit: string | undefined;

/**
 * Clear the pending production ICU miss, once the instance has reported it.
 * @internal
 */
export function clearIcuHit(): void {
  icuHit = undefined;
}

/**
 * Record a production ICU miss made by another compiler. `icuHit` is an ESM
 * live binding, so `compile-icu.ts` cannot assign it across the import.
 * @internal
 */
export function setIcuHit(argumentType: string): void {
  icuHit = argumentType;
}

/**
 * The default message compiler: text + `{param}` interpolation only.
 *
 * A comma inside parsed braces is the ICU argument-type marker
 * (`{name, plural, …}`). In development that THROWS `E_ICU_SYNTAX` at the
 * ingestion preflight. In production it returns `undefined`, so `parseTemplate`
 * emits one raw text token for the balanced brace group — the segment renders
 * literally and is never re-parsed by a tag extension — and records the
 * argument type for the instance's best-effort `E_ICU_SYNTAX` report.
 */
export const simpleCompiler: MessageCompiler = {
  cid: 1,
  preflight: true,
  makeArgToken(content: string, _hashIsSyntax: boolean, template: string): ParsedToken | undefined {
    const comma = content.indexOf(",");
    if (comma !== -1) {
      const argumentType = content
        .slice(comma + 1)
        .split(",", 1)[0]
        .trim();
      if (!IS_DEV) {
        icuHit = argumentType;
        return undefined;
      }
      const error = new Error(
        `[@comvi/core] "{${content}}" in "${template}" is ICU "${argumentType}" syntax; the default compiler supports {param} only. ` +
          (argumentType === "plural" ||
          argumentType === "select" ||
          argumentType === "selectordinal"
            ? `Pass compiler: icuCompiler from "@comvi/core/icu" in the constructor options.`
            : `"${argumentType}" is not a shipped ICU argument type: quote the literal ('{…}') or pass your own compiler.`),
      ) as IcuSyntaxError;
      error.code = "E_ICU_SYNTAX";
      error.argumentType = argumentType;
      throw error;
    }
    return [TK_PARAM, content.trim()];
  },
};
