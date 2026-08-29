import { warn } from "./logger";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * `undefined` for a null/undefined leaf (the key is then simply missing); every
 * other non-string is coerced with `String()`, so `translate()` can never crash
 * on a lookup.
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
 * Flatten a nested catalog to dot-notation keys. Iterative rather than
 * recursive, and the result has a NULL PROTOTYPE — which is what makes it safe
 * to store directly.
 */
export function flattenNestedObject(
  obj: Record<string, any>,
  prefix: string = "",
): Record<string, string> {
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
 * Normalize catalog input to the prototype-less flat shape the cache stores.
 * NEVER mutates the caller's object: a flat catalog is just the depth-1 case,
 * where the prefix stays empty and every key passes through unchanged.
 * Prototype-less input is assumed already normalized.
 */
export function normalizeTranslationObject(obj: Record<string, any>): Record<string, string> {
  return Object.getPrototypeOf(obj) === null
    ? (obj as Record<string, string>)
    : flattenNestedObject(obj);
}
