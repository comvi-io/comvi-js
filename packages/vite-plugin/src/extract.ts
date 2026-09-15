/** Extract translation keys and ICU params from local JSON files. */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * The schema shape is shared with the Comvi CLI through the workspace-private
 * typegen package, which both builds inline. Re-exported so the plugin's public
 * type names stay where consumers import them from.
 */
import type { KeySchema, ProjectSchema, SchemaParam } from "@comvi/typegen";

export type { KeySchema, ProjectSchema, SchemaParam };

interface TranslationFile {
  language: string;
  namespace: string;
  filePath: string;
}

/**
 * Parse a file template pattern into a regex for extracting language/namespace.
 *
 * @example
 * "{namespace}/{languageTag}.json" → regex that captures namespace and language
 */
function buildTemplateRegex(fileTemplate: string): RegExp {
  const escaped = fileTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replace("\\{languageTag\\}", "(?<language>[^/]+)")
    .replace("\\{namespace\\}", "(?<namespace>[^/]+)");
  return new RegExp(`^${pattern}$`);
}

async function findFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFiles(full)));
    } else if (entry.name.endsWith(".json")) {
      results.push(full);
    }
  }
  return results;
}

async function discoverFiles(
  translationsPath: string,
  fileTemplate: string,
): Promise<TranslationFile[]> {
  const regex = buildTemplateRegex(fileTemplate);
  const allFiles = await findFiles(translationsPath);
  const results: TranslationFile[] = [];

  for (const filePath of allFiles) {
    const relative = path.relative(translationsPath, filePath);
    const normalized = relative.split(path.sep).join("/");
    const match = normalized.match(regex);
    if (match?.groups) {
      results.push({
        language: match.groups.language,
        namespace: match.groups.namespace,
        filePath,
      });
    }
  }

  return results;
}

/**
 * Flatten a nested JSON object to dot-notation keys.
 *
 * { common: { greeting: "Hello {name}" } } → { "common.greeting": "Hello {name}" }
 */
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (typeof value === "string") {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Extract params from a translation value.
 * Uses brace scanning to handle arbitrary nesting depth.
 * Type is determined strictly from ICU syntax:
 * - {name} → string
 * - {count, plural, ...} → number
 * - {gender, select, ...} → string
 * - {val, number/date/time, ...} → number
 */

// The whole of an argument's contents: its name, and everything after the
// first comma when it has an argument type.
const ARGUMENT = /^([a-zA-Z_]\w*)\s*(,?)/;

/**
 * ICU DOUBLE_OPTIONAL quoting, the rule `@comvi/core`'s message parser applies
 * at runtime (`packages/core/src/core/translate/parser.ts`, `parseTemplate` and
 * `advancePastApostrophe`): an apostrophe opens quoted literal text only when it
 * immediately precedes a syntax character, and `''` is always one literal
 * apostrophe. So "Superiors' behavior" and a trailing "l'" survive as text,
 * while `'{name}'` is the literal five characters `{name}` and carries no
 * parameter.
 *
 * `{` and `}` are syntax everywhere; `#` is syntax only inside a plural or
 * selectordinal sub-message, so `'#'` at the top level is two literal
 * apostrophes around a hash.
 *
 * Extraction has to read the same grammar the compiler does, or the generated
 * types demand an argument no message consumes — a call the app cannot make
 * without inventing a value. Core does not publish its parser (only the
 * `MessageCompiler` type), and this plugin does not depend on `@comvi/core` at
 * all, so the rule is reimplemented here rather than imported. The test table
 * in `tests/extract.test.ts` pins it case by case against runtime behaviour.
 *
 * @returns the index just after the apostrophe at `index` and whatever it quotes
 */
function advancePastApostrophe(value: string, index: number, hashIsSyntax: boolean): number {
  const len = value.length;

  // `''` — one literal apostrophe, opening nothing.
  if (value[index + 1] === "'") return index + 2;

  const next = value[index + 1];
  const opensQuote = next === "{" || next === "}" || (hashIsSyntax && next === "#");
  if (!opensQuote) return index + 1;

  // Quoted section: it ends at the next lone apostrophe, and `''` inside it is
  // a literal apostrophe rather than that end. An unterminated section runs to
  // the end of the message, which is what the runtime does with it too.
  let i = index + 1;
  while (i < len) {
    if (value[i] === "'") {
      if (value[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return i;
}

/**
 * Whether the `{` at `braceIndex` opens an argument that rebinds `#` — an ICU
 * plural or selectordinal. Mirrors `isPluralArgStart` in core's ICU compiler,
 * which the parser consults for exactly this.
 */
function opensHashScope(value: string, braceIndex: number): boolean {
  const len = value.length;
  let i = braceIndex + 1;

  while (i < len && value[i] !== ",") {
    if (value[i] === "{" || value[i] === "}") return false;
    i++;
  }
  if (i >= len) return false;
  i++;

  while (i < len && value.charCodeAt(i) <= 32) i++;
  const typeStart = i;
  while (i < len) {
    const char = value[i];
    if (char === "," || char === "{" || char === "}" || value.charCodeAt(i) <= 32) break;
    i++;
  }

  const type = value.slice(typeStart, i);
  return type === "plural" || type === "selectordinal";
}

/**
 * Index of the `}` closing the `{` at `open`, or `undefined` when nothing closes
 * it.
 *
 * Quoted sections are skipped, so a `'}'` inside a branch does not close it,
 * and `#`'s syntax status is tracked per nesting level the way core's
 * `findMatchingBraceEnd` tracks it: entering a plural argument turns `'#'` into
 * a quote opener, and leaving it restores whatever the enclosing level had.
 */
function closingBrace(value: string, open: number, hashIsSyntax: boolean): number | undefined {
  const len = value.length;
  let depth = 1;
  let i = open + 1;
  let context = hashIsSyntax || opensHashScope(value, open);
  const contextStack: boolean[] = [];

  while (i < len) {
    const char = value[i];

    if (char === "'") {
      i = advancePastApostrophe(value, i, context);
      continue;
    }

    if (char === "{") {
      depth++;
      contextStack.push(context);
      if (!context && opensHashScope(value, i)) context = true;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i;
      if (contextStack.length > 0) context = contextStack.pop()!;
    }
    i++;
  }

  return undefined;
}

/**
 * Collect the placeholders of one message.
 *
 * A `{…}` group is only a placeholder where a message expects one. The branch
 * bodies of a `plural` / `select` / `selectordinal` are messages of their own,
 * so `{count, plural, one {item} other {items}}` has ONE parameter and
 * `{count, plural, other {# of {total}}}` has two — a body's braces hold text,
 * the braces inside a body hold a placeholder.
 *
 * `branches` says which of the two levels this call is scanning: the tail of a
 * complex argument, where every group is a body, or an ordinary message, where
 * every group is a placeholder.
 *
 * `hashIsSyntax` is true inside a plural or selectordinal sub-message, where
 * `#` is syntax and therefore `'#'` opens a quoted literal.
 */
function scanMessage(
  value: string,
  params: Map<string, SchemaParam>,
  branches: boolean,
  hashIsSyntax: boolean,
): void {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      // Quoted literal text holds no placeholders. The loop's own `i++` lands
      // on the first character past the quote.
      i = advancePastApostrophe(value, i, hashIsSyntax) - 1;
      continue;
    }

    if (value[i] !== "{") continue;

    const close = closingBrace(value, i, hashIsSyntax);
    if (close === undefined) continue;

    const inner = value.slice(i + 1, close);

    if (branches) {
      // A branch body is a message of its own, and it inherits the `#` scope of
      // the argument whose branch it is.
      scanMessage(inner, params, false, hashIsSyntax);
      i = close;
      continue;
    }

    const argument = inner.match(ARGUMENT);
    if (!argument) continue;

    // Everything up to `close` belongs to this argument; its branch bodies are
    // scanned below, never again as text of the message around it.
    i = close;

    const name = argument[1];
    const known = params.has(name);

    if (argument[2] !== ",") {
      // A bare `{name}` — anything else after the name (`{name x}`) is text.
      if (inner.length === argument[0].length && !known) {
        params.set(name, { name, type: "string" });
      }
      continue;
    }

    const afterName = inner.slice(argument[0].length).trimStart();
    const isPluralArg = afterName.startsWith("plural") || afterName.startsWith("selectordinal");

    if (!known) {
      if (isPluralArg) {
        params.set(name, { name, type: "number" });
      } else if (
        afterName.startsWith("number") ||
        afterName.startsWith("date") ||
        afterName.startsWith("time")
      ) {
        params.set(name, { name, type: "number" });
      } else if (afterName.startsWith("select")) {
        params.set(name, { name, type: "string" });
      }
    }

    // A plural's branches bind `#`; a select's do not, but a select nested in a
    // plural keeps the enclosing binding, as core's parser does.
    scanMessage(afterName, params, true, hashIsSyntax || isPluralArg);
  }
}

function extractParams(value: string): SchemaParam[] {
  const params = new Map<string, SchemaParam>();
  // A whole message starts outside any plural, so `#` is literal text here.
  scanMessage(value, params, false, false);
  return Array.from(params.values());
}

/**
 * Merge params from multiple languages for the same key.
 * Takes the union of all params (one language may have plural, another may not).
 * If a param appears with different types, "number" wins (more specific).
 */
function mergeParams(existing: SchemaParam[], incoming: SchemaParam[]): SchemaParam[] {
  const map = new Map<string, SchemaParam>();
  for (const p of existing) map.set(p.name, p);
  for (const p of incoming) {
    const prev = map.get(p.name);
    if (!prev) {
      map.set(p.name, p);
    } else if (p.type === "number") {
      map.set(p.name, p);
    }
  }
  return Array.from(map.values());
}

/**
 * Extract a full ProjectSchema from local translation files.
 *
 * Supports two file structures by default:
 * 1. Root default namespace files: en.json, fr.json
 * 2. File per non-default namespace: admin/en.json, admin/fr.json
 */
export async function extractSchema(options: {
  translationsPath: string;
  fileTemplate?: string;
  defaultNs?: string;
}): Promise<ProjectSchema> {
  const {
    translationsPath,
    fileTemplate = "{namespace}/{languageTag}.json",
    defaultNs = "default",
  } = options;

  const keys: Record<string, KeySchema> = {};

  const allJsonFiles = await findFiles(translationsPath);
  const matchedPaths = new Set<string>();

  const templateFiles = await discoverFiles(translationsPath, fileTemplate);
  for (const file of templateFiles) {
    matchedPaths.add(file.filePath);
    const content = await fs.readFile(file.filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const flat = flattenObject(json);

    for (const [key, value] of Object.entries(flat)) {
      const fullKey = `${file.namespace}:${key}`;
      const params = extractParams(value);
      if (keys[fullKey]) {
        keys[fullKey].params = mergeParams(keys[fullKey].params, params);
      } else {
        keys[fullKey] = { params };
      }
    }
  }

  // JSON files the template did not match fall back to the default namespace.
  for (const filePath of allJsonFiles) {
    if (matchedPaths.has(filePath)) continue;

    const content = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const flat = flattenObject(json);

    for (const [key, value] of Object.entries(flat)) {
      const fullKey = `${defaultNs}:${key}`;
      const params = extractParams(value);
      if (keys[fullKey]) {
        keys[fullKey].params = mergeParams(keys[fullKey].params, params);
      } else {
        keys[fullKey] = { params };
      }
    }
  }

  return { keys };
}
