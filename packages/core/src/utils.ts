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
 * recursive; the result is a fresh object with a NULL PROTOTYPE. It is a copy
 * because a nested or non-string catalog cannot be stored as it is, not as a
 * prototype-pollution guard: every lookup reads through a guard that answers
 * only string templates (`I18n#_template`).
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
 * True for an ordinary object (`{}` literal, `JSON.parse` result) whose every
 * own enumerable value is a string, in an environment where `Object.prototype`
 * carries no enumerable key. Only then does `for...in` see exactly the own
 * keys, which is why it is checked here, once per call. `for...in` rather than
 * `Object.keys`: on a fast-mode source object it builds no key array (about
 * 0.7 µs against 20 µs for 512 keys).
 */
function isPlainFlatCatalog(obj: Record<string, any>): boolean {
  for (const _ in Object.prototype) return false;
  for (const key in obj) {
    if (typeof obj[key] !== "string") return false;
  }
  return true;
}

/**
 * Normalize catalog input to a flat key → string catalog. NEVER mutates the
 * caller's object.
 *
 * A catalog that already has that shape is kept BY REFERENCE, without a copy:
 * - a null-prototype object whose leaves are all strings (a loader result, a
 *   previous flatten);
 * - a plain `Object.prototype` object whose own leaves are all strings, while
 *   `Object.prototype` itself has no enumerable key.
 *
 * Everything else (a nested value, a non-string leaf, a custom prototype, a
 * polluted `Object.prototype`) is flattened into a fresh null-prototype copy.
 * A kept object is read, never written: a merge copies into a new object, and
 * later edits the caller makes to it are visible to lookups. The built-in
 * members a plain object inherits never resolve, because the lookup guard
 * answers only strings.
 *
 * Outside the supported catalog shape: non-enumerable own properties, accessor
 * properties, Proxies and symbol keys (a lookup may see what SSR serialization
 * omits). Enumerable keys added to `Object.prototype` after ingestion are not
 * guarded against.
 */
export function normalizeTranslationObject(obj: Record<string, any>): Record<string, string> {
  const proto = Object.getPrototypeOf(obj);
  return (
    proto === null ? isFlatCatalog(obj) : proto === Object.prototype && isPlainFlatCatalog(obj)
  )
    ? (obj as Record<string, string>)
    : flattenNestedObject(obj);
}
