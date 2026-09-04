/**
 * The declaration emitter behind `@comvi/cli` and `@comvi/vite-plugin`.
 *
 * Both tools used to carry their own copy of this code, kept in step by a
 * repo-level parity test. A user who generates types with the CLI in CI and
 * with the Vite plugin in dev has to get the same declarations, so the copies
 * were merged into this package instead: the format lives in one place and
 * cannot drift.
 *
 * Zero dependencies and no Node built-ins — the caller owns reading the schema
 * and writing the file.
 */

/** `number` is the type carried by plural counts. */
export interface SchemaParam {
  name: string;
  type: "string" | "number";
}

export interface KeySchema {
  params: SchemaParam[];
}

/** Keys are in `"namespace:key"` format, e.g. `"common:greeting"`. */
export interface ProjectSchema {
  keys: Record<string, KeySchema>;
}

export interface EmitOptions {
  /** Make params required (true) or optional (false). @default true */
  strictParams?: boolean;
  /** Default namespace — keys from this ns drop their prefix. @default 'default' */
  defaultNs?: string;
  /**
   * Header line 3, verbatim, so each tool keeps its own "DO NOT EDIT" wording.
   * The line carries no timestamp: a regenerated file that is otherwise
   * unchanged must be byte-identical, or every run dirties the working tree.
   */
  generatedBy?: string;
}

/** Used when the caller names no tool of its own. */
const DEFAULT_GENERATED_BY = "DO NOT EDIT — this file is generated from your translation schema";

/**
 * How the header line `@comvi/cli` 0.4 wrote under its own begins, once the
 * comment indent is trimmed. Anchored rather than searched: a translation key
 * may contain this text, and dropping its declaration line would hide drift in
 * that key from every comparison.
 */
const TIMESTAMP_LINE_PREFIX = "* Generated at:";

export function emitDeclarations(schema: ProjectSchema, options: EmitOptions = {}): string {
  const {
    strictParams = true,
    defaultNs = "default",
    generatedBy = DEFAULT_GENERATED_BY,
  } = options;
  const defaultPrefix = `${defaultNs}:`;

  const lines: string[] = [
    "/**",
    " * Auto-generated translation keys",
    ` * ${generatedBy}`,
    " */",
    "",
    "// Import to ensure module is resolved before augmentation",
    "import '@comvi/core';",
    "",
    "declare module '@comvi/core' {",
    "  interface TranslationKeys {",
  ];

  // Code-unit order, which is what `Object.keys().sort()` gives. `localeCompare`
  // used to order this list, and disagreed with the other copy of the emitter on
  // any pair that differs in case.
  const paramsByKey = new Map<string, SchemaParam[]>();
  for (const [fullKey, keySchema] of Object.entries(schema.keys)) {
    const displayKey = fullKey.startsWith(defaultPrefix)
      ? fullKey.slice(defaultPrefix.length)
      : fullKey;

    // Two schema keys can map to one emitted key once the default prefix is
    // gone. Silently keeping the last one drops a key from the declarations and
    // the user finds out at the call site.
    if (paramsByKey.has(displayKey)) {
      throw new Error(
        `Translation key collision after stripping default namespace '${defaultNs}': '${fullKey}' maps to '${displayKey}'`,
      );
    }

    paramsByKey.set(displayKey, keySchema.params);
  }

  for (const key of [...paramsByKey.keys()].sort()) {
    lines.push(formatKeyType(key, paramsByKey.get(key)!, "    ", strictParams));
  }

  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("export {};");
  lines.push("");

  return lines.join("\n");
}

/**
 * Key lines already in a generated file on disk, counted for the CI report.
 * Both quote styles count: this emitter writes JSON-quoted keys, and a file left
 * by an older generator is single-quoted.
 */
export function countKeyLines(content: string): number {
  return content.match(/^\s+(?:'[^']*'|"(?:[^"\\]|\\.)*"):.*$/gm)?.length ?? 0;
}

/**
 * Drops what a regeneration is allowed to change, so `--check` compares only the
 * declarations. The WHOLE `Generated at:` header line goes, not just its tail: a
 * file written by 0.4 carries that line and 0.5 output does not, and leaving the
 * emptied line behind would report every existing repo as stale on upgrade.
 */
export function normalizeGenerated(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(TIMESTAMP_LINE_PREFIX))
    .join("\n")
    .trim();
}

function formatKeyType(
  key: string,
  params: SchemaParam[],
  indent: string,
  strictParams: boolean,
): string {
  // Property names go through JSON.stringify: a key or param name is free text
  // from the project, and an apostrophe in it used to close the quote and emit
  // a file TypeScript could not parse.
  if (params.length === 0) {
    return `${indent}${JSON.stringify(key)}: never;`;
  }

  const paramTypes = params.map((p) => {
    assertSupportedParamType(key, p);
    const optional = strictParams ? "" : "?";
    return `${JSON.stringify(p.name)}${optional}: ${p.type}`;
  });

  return `${indent}${JSON.stringify(key)}: { ${paramTypes.join("; ")} };`;
}

/**
 * A param type outside the schema contract would be pasted verbatim into the
 * declarations. Refuse it instead of emitting a file the user has to debug.
 */
function assertSupportedParamType(key: string, param: SchemaParam): void {
  if (param.type === "string" || param.type === "number") {
    return;
  }

  throw new Error(
    `Unsupported param type for translation key '${key}': param '${param.name}' has type '${param.type}'. Only 'string' and 'number' are supported.`,
  );
}
