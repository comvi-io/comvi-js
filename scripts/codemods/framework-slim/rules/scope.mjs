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

/**
 * The narrower unit the destructure MERGE reasons in: the nearest enclosing
 * BLOCK.
 *
 * A `let`/`const` binding lives in its block, not in its function, so merging
 * two `useI18n()` destructures per function hoists a binding out of the `if`
 * that declared it and every reference outside that block becomes a
 * ReferenceError. Only a per-block merge is sound, so T5 collapses repeated
 * destructures within one block and leaves a sibling block its own capability
 * call.
 *
 * A `switch` case is deliberately NOT a unit: sibling cases share ONE block
 * scope, so giving each its own capability call would emit the same `const`
 * twice in that scope. They keep merging, exactly as before.
 */
const BLOCK_KINDS = new Set(["statement_block", "class_static_block", "program"]);

/** Nearest enclosing statement block, or the program root. */
export function blockOf(node) {
  for (const ancestor of node.ancestors()) {
    if (BLOCK_KINDS.has(ancestor.kind())) return ancestor;
  }
  return node.getRoot().root();
}

/** Stable identity for a block node — its start offset. */
export function blockId(node) {
  return blockOf(node).range().start.index;
}
