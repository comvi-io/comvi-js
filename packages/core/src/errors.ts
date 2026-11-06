/**
 * Error codes and the default reporter.
 *
 * Every problem the runtime can hit is reported as an {@link I18nError} with a
 * stable `code`. The default reporter prints each (code, key, param) once in
 * development and is silent in production: the production graph holds no
 * console call at all (contract test `tests/contracts/prod-graph.test.ts`).
 * Rendering never depends on which reporter is installed — dev and prod print
 * the same text.
 */

declare const __DEV__: boolean;

export type I18nErrorCode =
  "missing_key" | "missing_param" | "syntax" | "load_failed" | "invalid_locale" | "fallback_used";

export interface I18nError {
  code: I18nErrorCode;
  key?: string;
  locale?: string;
  ns?: string;
  /** `missing_param`: the parameter that had no usable value. */
  param?: string;
  /**
   * Human-readable explanation. Development builds; in production only the `syntax`
   * report of `{x, number|date|time}` carries one (the useFormat() hint), others are
   * `undefined`.
   */
  message?: string;
  cause?: unknown;
}

export type OnError = (error: I18nError) => void;

/** Dedupe set for development diagnostics: one line per (code, key) and per warning id. */
const seen = new Set<string>();

const once = (id: string): boolean => !seen.has(id) && !!seen.add(id);

/** Does nothing; shared so production code carries one empty function. */
export const noop = (): void => {};

/** A load failure's cause for the console: an Error's message, else the value as a string. */
const printable = (cause: unknown): string => {
  try {
    return String(cause instanceof Error ? cause.message : cause);
  } catch {
    return "(cause not printable)";
  }
};

/**
 * The reporter used when none is configured: development `console.error` once per
 * (code, key, param) — and per (locale, ns) for the reports that name no key (a load
 * failure, an invalid locale); production silent.
 */
export const defaultOnError: OnError = !__DEV__
  ? noop
  : (error) => {
      if (
        once(
          [
            error.code,
            error.key,
            error.param,
            error.key === undefined && error.locale + "/" + error.ns,
          ].join("\0"),
        )
      ) {
        console.error(
          `[@comvi/core] ${error.code}` +
            (error.key === undefined ? "" : ` "${error.key}"`) +
            (error.locale === undefined
              ? ""
              : error.code == "load_failed"
                ? ` (${error.locale}, namespace "${error.ns}")`
                : ` (${error.locale})`) +
            (error.code == "load_failed"
              ? `: ${printable(error.cause)}`
              : error.message
                ? `: ${error.message}`
                : ""),
        );
      }
    };

/** Development-only warning, printed once per `id`. Folds out of production builds. */
export const devWarn = (id: string, message: string): void => {
  if (__DEV__ && once("w\0" + id)) console.warn(`[@comvi/core] ${message}`);
};

/** Test seam: forget which diagnostics were already printed. */
export const _resetDiagnostics = (): void => seen.clear();
