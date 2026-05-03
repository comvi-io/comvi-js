/**
 * Extract translation keys and params from local JSON files.
 *
 * Reads JSON translation files → flattens nested keys to dot-notation →
 * parses ICU-like params ({name}, {count, plural, ...}) from values.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface SchemaParam {
  name: string;
  type: "string" | "number";
}

export interface KeySchema {
  params: SchemaParam[];
}

export interface ProjectSchema {
  keys: Record<string, KeySchema>;
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
 * "{languageTag}/{namespace}.json" → regex that captures language and namespace
 */
function buildTemplateRegex(fileTemplate: string): RegExp {
  const escaped = fileTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replace("\\{languageTag\\}", "(?<language>[^/]+)")
    .replace("\\{namespace\\}", "(?<namespace>[^/]+)");
  return new RegExp(`^${pattern}$`);
}

/**
 * Recursively find all JSON files in a directory.
 */
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

/**
 * Discover translation files matching the template pattern.
 */
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

// Matches the start of a param after opening brace
const PARAM_START = /^([a-zA-Z_]\w*)(\s*[,}])/;

function extractParams(value: string): SchemaParam[] {
  const params = new Map<string, SchemaParam>();

  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "{") continue;

    const rest = value.slice(i + 1);
    const startMatch = rest.match(PARAM_START);
    if (!startMatch) continue;

    const name = startMatch[1];
    const delimiter = startMatch[2].trim(); // "," or "}"

    if (params.has(name)) continue;

    if (delimiter === "}") {
      // Simple placeholder: {name}
      params.set(name, { name, type: "string" });
    } else {
      // Complex ICU: {varName, type, ...}
      const afterName = rest.slice(name.length).trimStart().slice(1).trimStart(); // skip comma
      if (afterName.startsWith("plural") || afterName.startsWith("selectordinal")) {
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
  }

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
      // number is more specific (plural), prefer it
      map.set(p.name, p);
    }
  }
  return Array.from(map.values());
}

/**
 * Extract a full ProjectSchema from local translation files.
 *
 * Supports two file structures:
 * 1. Single file per language: en.json, fr.json (namespace = "default", keys are nested)
 * 2. File per namespace: en/common.json, en/admin.json
 */
export async function extractSchema(options: {
  translationsPath: string;
  fileTemplate?: string;
  defaultNs?: string;
}): Promise<ProjectSchema> {
  const {
    translationsPath,
    fileTemplate = "{languageTag}/{namespace}.json",
    defaultNs = "default",
  } = options;

  const keys: Record<string, KeySchema> = {};

  const allJsonFiles = await findFiles(translationsPath);
  const matchedPaths = new Set<string>();

  // Step 1: Match files against template pattern
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

  // Step 2: Unmatched JSON files → default namespace
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
