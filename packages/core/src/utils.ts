import { warn } from "./logger";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * Normalize a leaf catalog value to a string.
 * Returns undefined for null/undefined (key treated as missing) and coerces
 * other non-strings with String() so translate() never crashes on lookup.
 */
function normalizeLeafValue(key: string, value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value == null) {
    if (IS_DEV) {
      warn(`[i18n] Dropping translation "${key}": value is ${String(value)}`);
    }
    return undefined;
  }
  if (IS_DEV) {
    warn(
      `[i18n] Translation "${key}" is not a string (got ${
        Array.isArray(value) ? "array" : typeof value
      }); coercing with String()`,
    );
  }
  return String(value);
}

/**
 * Converts a nested object structure to a flattened structure with dot notation keys.
 * Uses iterative approach with a stack for better performance.
 * @param obj - The nested object to flatten
 * @param prefix - The prefix to add to each key (optional)
 * @returns A flattened object with dot notation keys (no prototype)
 */
export function flattenNestedObject(
  obj: Record<string, any>,
  prefix: string = "",
): Record<string, string> {
  // Create object without prototype for faster property access
  const result: Record<string, string> = Object.create(null);
  const objectStack: Record<string, any>[] = [obj];
  const prefixStack: string[] = [prefix];

  while (objectStack.length > 0) {
    const currentObj = objectStack.pop()!;
    const currentPrefix = prefixStack.pop()!;
    const keys = Object.keys(currentObj);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = currentObj[key];
      const newKey = currentPrefix ? currentPrefix + "." + key : key;

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Push nested object to stack for processing
        objectStack.push(value);
        prefixStack.push(newKey);
      } else {
        const leaf = normalizeLeafValue(newKey, value);
        if (leaf !== undefined) result[newKey] = leaf;
      }
    }
  }

  return result;
}

/**
 * Normalizes translation input into the prototype-less flat shape used by the cache.
 * Never mutates the caller's object: flat catalogs are shallow-copied, nested
 * catalogs are flattened. Prototype-less input is assumed already normalized.
 */
export function normalizeTranslationObject(obj: Record<string, any>): Record<string, string> {
  if (Object.getPrototypeOf(obj) === null) {
    return obj as Record<string, string>;
  }

  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const value = obj[keys[i]];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return flattenNestedObject(obj);
    }
  }

  const result: Record<string, string> = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const leaf = normalizeLeafValue(key, obj[key]);
    if (leaf !== undefined) result[key] = leaf;
  }

  return result;
}
