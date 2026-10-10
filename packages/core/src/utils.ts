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
      warn(`[@comvi/core] Dropping translation "${key}": value is ${String(value)}`);
    }
    return undefined;
  }
  if (IS_DEV) {
    warn(
      `[@comvi/core] Translation "${key}" is not a string (got ${
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
 * True when every own value is already a string — i.e. the object IS the shape
 * the cache stores, and adopting it whole changes nothing.
 *
 * A missing prototype is NOT that proof. `Object.create(null)` is a normal way
 * to build a nested catalog, and one adopted on its prototype alone stored an
 * object-valued leaf: `t("nav.home")` answered with the key, and `t("nav")`
 * crashed trying to render the object.
 */
function isFlatCatalog(obj: Record<string, any>): boolean {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (typeof obj[keys[i]] !== "string") return false;
  }
  return true;
}

/**
 * Normalize catalog input to the prototype-less flat shape the cache stores.
 * NEVER mutates the caller's object: a flat catalog is just the depth-1 case,
 * where the prefix stays empty and every key passes through unchanged.
 *
 * Prototype-less input whose leaves are all strings is adopted WITHOUT a copy —
 * the contract that keeps re-ingesting an already-normalized catalog (a loader
 * result, a previous flatten) off `Object.assign`'s ~130 ns per key. The leaf
 * scan is one `typeof` per key on the ingestion path only.
 */
export function normalizeTranslationObject(obj: Record<string, any>): Record<string, string> {
  return Object.getPrototypeOf(obj) === null && isFlatCatalog(obj)
    ? (obj as Record<string, string>)
    : flattenNestedObject(obj);
}
