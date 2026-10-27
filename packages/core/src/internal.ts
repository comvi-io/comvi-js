/**
 * @comvi/core/internal — seams for bindings, devtools and benches. Not documented,
 * no semver guarantee (design §2.1).
 */
export { compile, render, recordFor, lookup, inherit } from "./compile/cache";
export type { Compiled, CompiledRecord, Render, Rendered, SyntaxId } from "./compile/cache";
export type { Env, Params } from "./compile/scanner";
export { formatNumber, formatValue, pluralRules } from "./compile/fmt";
export { canonicalize, parents, dir, negotiate } from "./locale";
export { defaultOnError } from "./errors";
