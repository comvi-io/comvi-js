/**
 * Error codes and the default reporter.
 *
 * Every problem the runtime can hit is reported as an {@link I18nError} with a
 * stable `code`. The default reporter prints each (code, key, message) once in
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

/** The reporter used when none is configured: dev `console.error` once per (code, key, message); prod silent. */
export const defaultOnError: OnError = (error) => {
  // One line per (code, key, message): the message names the parameter, so a second
  // missing parameter of the same key is printed too (0.7: once per template × param).
  if (__DEV__ && once(error.code + "\0" + error.key + "\0" + error.message)) {
    console.error(
      `[@comvi/core] ${error.code}` +
        (error.key === undefined ? "" : ` "${error.key}"`) +
        (error.locale === undefined ? "" : ` (${error.locale})`) +
        (error.message ? `: ${error.message}` : ""),
    );
  }
};

/** Development-only warning, printed once per `id`. Folds out of production builds. */
export const devWarn = (id: string, message: string): void => {
  if (__DEV__ && once("w\0" + id)) console.warn(`[@comvi/core] ${message}`);
};

/** Test seam: forget which diagnostics were already printed. */
export const _resetDiagnostics = (): void => seen.clear();
