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

/** A key whose message carries ICU syntax `@comvi/core` does not implement. */
export interface ExtractionIssue {
  /** `"namespace:key"`, as it appears in the schema. */
  key: string;
  filePath: string;
  /** The ICU argument type core refused, e.g. `"number"`. */
  argumentType: string;
  /** The message itself, so the report can quote it. */
  value: string;
}

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
  // Null prototype: a key literally named `__proto__` has to land as data, not
  // hit Object.prototype's setter and vanish from the generated types.
  const result: Record<string, string> = Object.create(null) as Record<string, string>;

  const visit = (node: Record<string, unknown>, path: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const fullKey = path ? `${path}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        visit(value as Record<string, unknown>, fullKey);
      } else if (typeof value === "string") {
        result[fullKey] = value;
      }
    }
  };

  visit(obj, prefix);
  return result;
}

/**
 * Extract the parameters of a translation value, reading the same grammar
 * `@comvi/core` reads at runtime.
 *
 * - `{name}`, `{ name }`, `{name x}`, `{0}` → one `string` parameter whose name
 *   is the trimmed contents, because that is what core's compiler makes of a
 *   group with no comma in it.
 * - `{count, plural, …}` and `{count, selectordinal, …}` → `number`.
 * - `{gender, select, …}` → `string`.
 * - Any other argument type — `{price, number}`, `{when, date, short}`,
 *   `{n, pluralx, …}` — and any of the three with a choice list that does not
 *   parse: NO parameter, and the message is reported as an issue. `@comvi/core`
 *   implements no `number`, `date` or `time` argument type (see
 *   `docs/design/limitations.md`); it raises `E_ICU_SYNTAX`, which the
 *   ingestion preflight turns into a refusal of the whole key. Generating a
 *   parameter for such a key would demand an argument at a call that throws.
 * - An unclosed `{` makes everything from it to the end literal text, as core's
 *   `extractToken` does when `findMatchingBraceEnd` finds no match.
 */

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
 * One `{…}` group, read the way core's `makeIcuArgToken` reads it.
 *
 * A comma at depth zero makes the argument TYPED, and only `plural`,
 * `selectordinal` and `select` are implemented — each needing a choice list
 * that parses. Everything else is a refusal, not a parameter.
 */
type Argument =
  | { kind: "param"; name: string }
  | { kind: "plural"; name: string; branches: string[] }
  | { kind: "select"; name: string; branches: string[] }
  | { kind: "unsupported"; type: string };

/**
 * The choice list's sub-messages, or `undefined` when the list is malformed.
 *
 * Mirrors core's `parsePluralChoices`: a selector runs to the next whitespace
 * or `{`, and what follows must be a braced sub-message. A trailing selector
 * with no sub-message, or anything that is not a selector followed by a brace,
 * makes the whole argument fail — which is why a malformed list produces no
 * parameter here either.
 */
function parseChoices(choicesStr: string, hashIsSyntax: boolean): string[] | undefined {
  const branches: string[] = [];
  const len = choicesStr.length;
  let i = 0;

  while (i < len) {
    while (i < len && choicesStr.charCodeAt(i) <= 32) i++;
    if (i >= len) break;

    while (i < len) {
      const code = choicesStr.charCodeAt(i);
      if (code <= 32 || choicesStr[i] === "{") break;
      i++;
    }

    while (i < len && choicesStr.charCodeAt(i) <= 32) i++;
    if (choicesStr[i] !== "{") return undefined;

    const close = closingBrace(choicesStr, i, hashIsSyntax);
    if (close === undefined) return undefined;

    branches.push(choicesStr.slice(i + 1, close));
    i = close + 1;
  }

  return branches;
}

/** Reads the contents of one `{…}` group. `hashIsSyntax` applies to its quoting. */
function readArgument(content: string, hashIsSyntax: boolean): Argument {
  const len = content.length;
  let firstComma = -1;
  let secondComma = -1;
  let depth = 0;

  for (let i = 0; i < len; i++) {
    const char = content[i];

    if (char === "'") {
      i = advancePastApostrophe(content, i, hashIsSyntax) - 1;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === "," && depth === 0) {
      if (firstComma === -1) firstComma = i;
      else {
        secondComma = i;
        break;
      }
    }
  }

  // No comma: the whole content is the parameter name, whatever it looks like.
  // `{ spaced }`, `{name x}` and `{0}` are all parameters at runtime.
  if (firstComma === -1) return { kind: "param", name: content.trim() };

  const name = content.slice(0, firstComma).trim();
  const type = (
    secondComma === -1 ? content.slice(firstComma + 1) : content.slice(firstComma + 1, secondComma)
  ).trim();

  // A one-comma argument (`{n, plural}`) has a type but no choice list, which
  // core refuses as well.
  if (secondComma === -1) return { kind: "unsupported", type };

  const isPlural = type === "plural" || type === "selectordinal";
  if (isPlural || type === "select") {
    const branches = parseChoices(
      content.slice(secondComma + 1).trim(),
      isPlural ? true : hashIsSyntax,
    );
    if (branches === undefined) return { kind: "unsupported", type };
    return { kind: isPlural ? "plural" : "select", name, branches };
  }

  return { kind: "unsupported", type };
}

/** What one message yielded: its parameters, or the argument that made it unusable. */
interface MessageScan {
  params: Map<string, SchemaParam>;
  unsupported?: string;
}

/**
 * Collect the parameters of one message.
 *
 * A `{…}` group is a placeholder or a typed argument; a typed argument's branch
 * bodies are messages of their own, so `{count, plural, one {item} other
 * {items}}` has ONE parameter and `{count, plural, other {# of {total}}}` has
 * two — a body's braces hold text, the braces inside a body hold a placeholder.
 *
 * `hashIsSyntax` is true inside a plural or selectordinal sub-message, where
 * `#` is syntax and therefore `'#'` opens a quoted literal.
 */
function scanMessage(value: string, scan: MessageScan, hashIsSyntax: boolean): void {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      // Quoted literal text holds no placeholders. The loop's own `i++` lands
      // on the first character past the quote.
      i = advancePastApostrophe(value, i, hashIsSyntax) - 1;
      continue;
    }

    if (value[i] !== "{") continue;

    const close = closingBrace(value, i, hashIsSyntax);
    // Nothing closes it: the rest of the message is literal text, exactly as
    // core's parser treats it, so no later group is a placeholder either.
    if (close === undefined) return;

    const argument = readArgument(value.slice(i + 1, close), hashIsSyntax);
    i = close;

    if (argument.kind === "unsupported") {
      scan.unsupported ??= argument.type;
      continue;
    }

    if (!scan.params.has(argument.name)) {
      scan.params.set(argument.name, {
        name: argument.name,
        type: argument.kind === "plural" ? "number" : "string",
      });
    }

    if (argument.kind === "param") continue;

    for (const branch of argument.branches) {
      scanMessage(branch, scan, hashIsSyntax || argument.kind === "plural");
    }
  }
}

function extractParams(value: string): { params: SchemaParam[]; unsupported?: string } {
  const scan: MessageScan = { params: new Map() };
  // A whole message starts outside any plural, so `#` is literal text here.
  scanMessage(value, scan, false);

  // An argument core cannot compile makes the ingestion preflight refuse the
  // whole key, so no parameter of it is reachable — including the ones in the
  // parts that would have compiled.
  if (scan.unsupported !== undefined) return { params: [], unsupported: scan.unsupported };

  return { params: Array.from(scan.params.values()) };
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
  /**
   * Called for a key whose message `@comvi/core` cannot compile. Generation
   * continues — the key is still a key — but it gets no parameters, so the
   * project hears about the catalog defect instead of discovering it at the
   * first render.
   */
  onIssue?: (issue: ExtractionIssue) => void;
}): Promise<ProjectSchema> {
  const {
    translationsPath,
    fileTemplate = "{namespace}/{languageTag}.json",
    defaultNs = "default",
    onIssue,
  } = options;

  // Keyed by `namespace:key` names from the project's files, so null-prototype
  // as well: `keys[fullKey]` must never find an inherited member.
  const keys: Record<string, KeySchema> = Object.create(null) as Record<string, KeySchema>;

  function paramsFor(value: string, fullKey: string, filePath: string): SchemaParam[] {
    const { params, unsupported } = extractParams(value);
    if (unsupported !== undefined) {
      onIssue?.({ key: fullKey, filePath, argumentType: unsupported, value });
    }
    return params;
  }

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
      const params = paramsFor(value, fullKey, file.filePath);
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
      const params = paramsFor(value, fullKey, filePath);
      if (keys[fullKey]) {
        keys[fullKey].params = mergeParams(keys[fullKey].params, params);
      } else {
        keys[fullKey] = { params };
      }
    }
  }

  return { keys };
}
