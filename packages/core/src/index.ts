/**
 * @comvi/core — lot 1a of the 0.8 rebuild.
 *
 * This entry exports what exists so far: locale negotiation and the public types.
 * `createI18n` and the instance arrive in lot 1b; until then the message compiler is
 * reachable through `@comvi/core/internal` (bindings, tests and benches only — no
 * semver guarantee).
 */
export { negotiate } from "./locale";
export type { I18nError, I18nErrorCode, OnError } from "./errors";
export type { Catalog } from "./compile/cache";
export type {
  Args,
  Catalogs,
  KeysOf,
  NsOf,
  OutOf,
  ParamsFor,
  RichParts,
  Tag,
  TFor,
  TranslateFn,
  UntypedT,
} from "./types";
