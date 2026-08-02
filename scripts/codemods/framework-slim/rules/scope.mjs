/**
 * The scope every rule reasons in: the nearest enclosing function.
 *
 * It is the unit of T5's "at most ONE `useI18nLoader()` / `useI18nPlugins()`
 * call per function", and the unit the report-only detectors resolve bindings
 * in — searching the whole file would make two functions that happen to name
 * a local `bag` contaminate each other's findings.
 */
const FUNCTION_KINDS = new Set([
  "function_declaration",
  "function_expression",
  "generator_function",
  "generator_function_declaration",
  "arrow_function",
  "method_definition",
]);

/** Nearest enclosing function node, or the program root. */
export function scopeOf(node) {
  for (const ancestor of node.ancestors()) {
    if (FUNCTION_KINDS.has(ancestor.kind())) return ancestor;
  }
  return node.getRoot().root();
}

/** Stable identity for a scope node — its start offset. */
export function scopeId(node) {
  return scopeOf(node).range().start.index;
}
