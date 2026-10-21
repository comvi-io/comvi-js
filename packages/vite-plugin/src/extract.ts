/** Extract translation keys and ICU params from local JSON files. */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * The schema shape is shared with the Comvi CLI through the workspace-private
 * typegen package, which both builds inline. Re-exported so the plugin's public
 * type names stay where consumers import them from.
 */
import {
  scanMessageShape,
  type KeySchema,
  type ProjectSchema,
  type SchemaParam,
} from "@comvi/typegen";

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
 * The parameters of a translation value, or the ICU argument type that makes
 * the whole key unusable.
 *
 * The message is read by typegen's `scanMessageShape`, which reads the grammar
 * `@comvi/core` reads at runtime (`message-shape.ts` says how). An
 * argument core cannot compile makes the ingestion preflight refuse the whole
 * key, so no parameter of it is reachable — including the ones in the parts
 * that would have compiled.
 */
function extractParams(value: string): { params: SchemaParam[]; unsupported?: string } {
  const shape = scanMessageShape(value);
  return shape.unsupported !== undefined
    ? { params: [], unsupported: shape.unsupported }
    : { params: shape.params };
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
