import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { TranslationSync } from "./TranslationSync";
import { atomicWriteFile } from "../utils/atomicWrite";
import { dictionaryFrom, emptyDictionary, hasOwnKey } from "../utils/dictionary";

/**
 * The merge writer of `comvi translate`. Unlike a pull, which replaces each
 * file with the platform's catalog, it only fills gaps:
 *
 * - Only keys of the local source catalog are written, and only where the
 *   local target is missing: absent, `null` or `""`. A whitespace-only value
 *   is a value, as on the platform.
 * - A non-empty local value is never overwritten; one that differs from the
 *   platform's is reported.
 * - Everything else in the file stays: local-only keys, and the shape. A
 *   nested file stays nested, a flat one flat; a new file takes the shape of
 *   the source file.
 * - A key that cannot nest (`a.b` under a leaf `a`, or a leaf `a` over an
 *   object `a`) is reported and not written.
 * - Each file is read right before it is written, and written atomically.
 *   An edit made between that read and the rename is lost: nobody else is
 *   expected to write the same files during a run.
 */

export interface MergeOptions {
  sync: TranslationSync;
  defaultNamespace?: string;
  /** The source locale in its local spelling: its files give new files their shape. */
  sourceLocale: string;
  /** The local source catalog, flattened: namespace → key → value. */
  source: Record<string, Record<string, string>>;
  /** The platform's values: target locale (local spelling) → namespace → key → value. */
  targets: Record<string, Record<string, Record<string, string>>>;
}

export interface MergeFileReport {
  locale: string;
  namespace: string;
  filePath: string;
  /** The file did not exist and was written. */
  created: boolean;
  /** Keys written from the platform. */
  filled: string[];
  /** Keys with a local value that differs from the platform's; kept as they are. */
  differ: string[];
  /** Keys that could not be written into the file's structure. */
  collisions: string[];
  /** Source keys with a non-empty source whose target is still missing. */
  missing: string[];
}

export interface MergeReport {
  files: MergeFileReport[];
  /** Files that could not be read, judged or written; left as they were. */
  errors: Array<{ locale: string; namespace: string; filePath?: string; message: string }>;
}

type Catalog = Record<string, unknown>;

interface Leaf {
  holder: Catalog;
  prop: string;
  value: string | null;
}

export async function mergeMissing(options: MergeOptions): Promise<MergeReport> {
  const report: MergeReport = { files: [], errors: [] };

  for (const [locale, remoteNamespaces] of Object.entries(options.targets)) {
    for (const [namespace, sourceCatalog] of Object.entries(options.source)) {
      let filePath: string | undefined;
      try {
        filePath = await options.sync.catalogPath(locale, namespace, options.defaultNamespace);
        report.files.push(
          await mergeFile(
            options,
            locale,
            namespace,
            filePath,
            sourceCatalog,
            remoteNamespaces[namespace],
          ),
        );
      } catch (error) {
        report.errors.push({
          locale,
          namespace,
          filePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return report;
}

async function mergeFile(
  options: MergeOptions,
  locale: string,
  namespace: string,
  filePath: string,
  sourceCatalog: Record<string, string>,
  remote: Record<string, string> | undefined,
): Promise<MergeFileReport> {
  const result: MergeFileReport = {
    locale,
    namespace,
    filePath,
    created: false,
    filled: [],
    differ: [],
    collisions: [],
    missing: [],
  };

  const text = await readIfExists(filePath);
  const root = text === null ? emptyDictionary<unknown>() : parseCatalog(text, filePath);
  const leaves = indexLeaves(root, filePath);
  const nested =
    text === null
      ? await sourceIsNested(options, namespace)
      : Object.values(root).some(isPlainObject);

  for (const key of Object.keys(sourceCatalog)) {
    const value = remote && hasOwnKey(remote, key) ? remote[key] : undefined;
    if (!value) continue;

    const leaf = leaves.get(key);
    if (leaf) {
      if (isMissing(leaf.value)) {
        leaf.holder[leaf.prop] = value;
        result.filled.push(key);
      } else if (leaf.value !== value) {
        result.differ.push(key);
      }
    } else if (!nested) {
      root[key] = value;
      result.filled.push(key);
    } else if (placeNested(root, key, value, leaves)) {
      result.filled.push(key);
    } else {
      result.collisions.push(key);
    }
  }

  const filled = new Set(result.filled);
  for (const [key, sourceValue] of Object.entries(sourceCatalog)) {
    if (sourceValue === "" || filled.has(key)) continue;
    const leaf = leaves.get(key);
    if (!leaf || isMissing(leaf.value)) result.missing.push(key);
  }

  if (result.filled.length > 0) {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await atomicWriteFile(filePath, JSON.stringify(root, null, 2) + "\n");
    result.created = text === null;
  }

  return result;
}

/** The same "missing" as the platform's: absent, `null` or `""`. */
function isMissing(value: string | null): boolean {
  return value === null || value === "";
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Every object becomes a null-prototype map, so a key named `__proto__` is
 * data on read and on write.
 */
function parseCatalog(text: string, filePath: string): Catalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value: unknown) =>
      isPlainObject(value) ? dictionaryFrom(value) : value,
    );
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid translation file ${filePath}: expected a JSON object`);
  }
  return parsed;
}

/** Each dotted key of the file and where its value sits. */
function indexLeaves(root: Catalog, filePath: string): Map<string, Leaf> {
  const leaves = new Map<string, Leaf>();
  const visit = (node: Catalog, prefix: string) => {
    for (const prop of Object.keys(node)) {
      const value = node[prop];
      const key = prefix ? `${prefix}.${prop}` : prop;
      if (typeof value === "string" || value === null) {
        if (leaves.has(key)) {
          throw new Error(
            `Duplicate translation key in ${filePath}: "${key}" is defined both as a flat key and through nesting`,
          );
        }
        leaves.set(key, { holder: node, prop, value });
      } else if (isPlainObject(value)) {
        visit(value, key);
      } else {
        throw new Error(
          `Invalid translation value in ${filePath}: key "${key}" is not a string or a nested object`,
        );
      }
    }
  };
  visit(root, "");
  return leaves;
}

/**
 * Nest `key` along its dots. An empty leaf on the way gives way to an
 * object; a non-empty leaf on the way, or an object where the value goes, is
 * a collision and nothing is changed.
 */
function placeNested(
  root: Catalog,
  key: string,
  value: string,
  leaves: Map<string, Leaf>,
): boolean {
  const segments = key.split(".");
  const last = segments.pop()!;

  let node = root;
  let depth = 0;
  for (; depth < segments.length; depth++) {
    const child = hasOwnKey(node, segments[depth]) ? node[segments[depth]] : undefined;
    if (!isPlainObject(child)) break;
    node = child;
  }
  if (depth < segments.length) {
    const blocker = hasOwnKey(node, segments[depth]) ? node[segments[depth]] : undefined;
    if (typeof blocker === "string" && blocker !== "") return false;
  } else if (hasOwnKey(node, last)) {
    // Not a leaf (those are indexed), so an object holding other keys.
    return false;
  }

  for (; depth < segments.length; depth++) {
    // An empty leaf gives way to the object: it is no longer a key of the file.
    leaves.delete(segments.slice(0, depth + 1).join("."));
    const child = emptyDictionary<unknown>();
    node[segments[depth]] = child;
    node = child;
  }
  node[last] = value;
  return true;
}

async function sourceIsNested(options: MergeOptions, namespace: string): Promise<boolean> {
  const sourcePath = await options.sync.catalogPath(
    options.sourceLocale,
    namespace,
    options.defaultNamespace,
  );
  const text = await readIfExists(sourcePath);
  return text !== null && Object.values(parseCatalog(text, sourcePath)).some(isPlainObject);
}

/** Every object here came out of `JSON.parse`, so an object that is not an array is a map. */
function isPlainObject(value: unknown): value is Catalog {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
