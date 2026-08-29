/**
 * Import maintenance for the single-entry rules.
 *
 * Every rewrite below introduces a BINDING (`plugins`, `icuCompiler`,
 * `flattenCatalog`, `devtools`, a lowercase plugin installer), and a codemod
 * that emits a reference it never imported has produced a broken file, not a
 * migration. So the plan and the import land in the SAME edit set, and a name
 * the codemod cannot place is a manual action instead of a rewrite.
 */
import { CORE_SUBPATH_OF, SLIM_SUBPATH } from "./capabilities.mjs";
import { braceListInsertion } from "./script-blocks.mjs";

const DECLARATION_KINDS = new Set([
  "variable_declarator",
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "class_declaration",
  "class_expression",
  "enum_declaration",
  "function_signature",
  "internal_module",
]);

/**
 * The quoted `source` of an import/export statement, unquoted.
 *
 * A retired `/slim` subpath reports as the entry it is about to become: the
 * specifier rewrite (§7.2-1) lands in the SAME edit set, so a capability the
 * chain needs merges into that clause instead of opening a second import of a
 * module the file will already have.
 */
export function moduleOf(declaration) {
  const source = declaration.field("source");
  return source === null ? undefined : source.text().slice(1, -1).replace(SLIM_SUBPATH, "$1");
}

/**
 * Every named import in the file: `{ local, imported, specifier, clause,
 * declaration, source, typeOnly }`. `local` is what the code writes,
 * `imported` is what the module exports — the two differ under
 * `import { a as b }`. Type-only imports are recorded so no runtime installer
 * is ever merged into or "satisfied" by a binding erased by TypeScript.
 */
export function namedImports(root) {
  const entries = [];
  for (const declaration of root.findAll({ rule: { kind: "import_statement" } })) {
    const source = moduleOf(declaration);
    if (source === undefined) continue;
    for (const clause of declaration.findAll({ rule: { kind: "named_imports" } })) {
      for (const specifier of clause.findAll({ rule: { kind: "import_specifier" } })) {
        const name = specifier.field("name");
        if (name === null) continue;
        const alias = specifier.field("alias");
        entries.push({
          local: (alias ?? name).text(),
          imported: name.text(),
          specifier,
          name,
          alias,
          clause,
          declaration,
          source,
          typeOnly:
            /^\s*import\s+type\b/.test(declaration.text()) || /^\s*type\b/.test(specifier.text()),
        });
      }
    }
  }
  return entries;
}

/** The named import that provides local binding `name`, if any. */
export function importedBinding(root, name) {
  return namedImports(root).find((entry) => entry.local === name);
}

/**
 * Non-import declarations of `name` in the file: a local `function plugins()`,
 * `const { plugins } = …`, parameter, default import, or namespace import
 * shadows any import the codemod would add. Missing one produces invalid
 * duplicate bindings, so uncertain declaration shapes are refusals.
 */
export function localDeclarations(root, name) {
  const found = root.findAll({
    rule: { kind: "shorthand_property_identifier_pattern", regex: `^${name}$` },
  });
  for (const node of root.findAll({ rule: { kind: "identifier", regex: `^${name}$` } })) {
    const parent = node.parent();
    if (parent === null) continue;
    const kind = parent.kind();
    const value = parent.field("value");
    const left = parent.field("left");
    const declares =
      (DECLARATION_KINDS.has(kind) && parent.field("name")?.text() === name) ||
      kind === "required_parameter" ||
      kind === "optional_parameter" ||
      kind === "catch_clause" ||
      kind === "formal_parameters" ||
      kind === "namespace_import" ||
      kind === "import_clause" ||
      kind === "import_require_clause" ||
      kind === "shorthand_property_identifier_pattern" ||
      kind === "array_pattern" ||
      kind === "rest_pattern" ||
      (kind === "pair_pattern" && value?.text() === name) ||
      (kind === "assignment_pattern" && left?.text() === name);
    if (declares) found.push(node);
  }
  return found;
}

/**
 * Whether local binding `name` already denotes the exact comvi API the
 * rewrite wants.
 *
 * An import is reusable when it already comes from the requested module. A
 * wrapper-host rewrite may also reuse the canonical core subpath for a known
 * core binding. Merely sharing the `@comvi/*` scope is not enough: plugin
 * packages expose unrelated APIs and treating one as equivalent would emit a
 * call to the wrong function.
 *
 * @returns {"available" | "collision" | "absent"}
 */
export function bindingState(root, name, module) {
  const imported = importedBinding(root, name);
  if (imported !== undefined) {
    const canonical = CORE_SUBPATH_OF.get(name);
    const sameApi = imported.imported === name && !imported.typeOnly;
    return sameApi && (imported.source === module || imported.source === canonical)
      ? "available"
      : "collision";
  }
  return localDeclarations(root, name).length > 0 ? "collision" : "absent";
}

/**
 * Edits that make `needs` (binding name -> module specifier) importable.
 *
 * A module the file already imports FROM gets the name merged into its existing
 * clause — one import per module, import grouping untouched. Anything new lands
 * on its own line right after the last `@comvi/*` import (or, failing that, the
 * last import in the file), which keeps the comvi block together instead of
 * scattering capability imports through the user's groups.
 */
export function planNamedImports(root, text, needs) {
  const declarations = root.findAll({ rule: { kind: "import_statement" } });
  const merges = new Map(); // clause start offset -> { clause, names }
  const fresh = new Map(); // module -> names

  for (const [name, module] of [...needs].sort()) {
    const host = declarations.find(
      (declaration) =>
        moduleOf(declaration) === module &&
        !/^\s*import\s+type\b/.test(declaration.text()) &&
        declaration.find({ rule: { kind: "named_imports" } }) !== null,
    );
    if (host !== undefined) {
      const clause = host.find({ rule: { kind: "named_imports" } });
      const key = clause.range().start.index;
      const bucket = merges.get(key) ?? { clause, names: [] };
      bucket.names.push(name);
      merges.set(key, bucket);
      continue;
    }
    const bucket = fresh.get(module) ?? [];
    bucket.push(name);
    fresh.set(module, bucket);
  }

  const edits = [...merges.values()].map(({ clause, names }) => braceListInsertion(clause, names));
  if (fresh.size === 0) return { edits, manual: [] };

  const comviImports = declarations.filter((declaration) =>
    moduleOf(declaration)?.startsWith("@comvi/"),
  );
  const anchor = comviImports[comviImports.length - 1] ?? declarations[declarations.length - 1];
  if (anchor === undefined) {
    return {
      edits,
      manual: [...fresh].map(([module, names]) => ({
        offset: 0,
        shape: "manual-import",
        detail: `this module has no import statement to grow — add \`import { ${names.join(
          ", ",
        )} } from "${module}";\` yourself`,
      })),
    };
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const at = anchor.range().end.index;
  edits.push({
    start: at,
    end: at,
    text: [...fresh]
      .sort()
      .map(([module, names]) => `${eol}import { ${names.join(", ")} } from "${module}";`)
      .join(""),
  });
  return { edits, manual: [] };
}
