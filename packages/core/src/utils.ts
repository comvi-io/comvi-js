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
        // Value is a primitive, store it with the dotted key
        result[newKey] = value;
      }
    }
  }

  return result;
}

/**
 * Normalizes translation input into the prototype-less flat shape used by the cache.
 * Flat catalogs are sanitized in place when possible to avoid copy cost, while
 * nested or mixed catalogs fall back to full flattening.
 */
export function normalizeTranslationObject(obj: Record<string, any>): Record<string, string> {
  const prototype = Object.getPrototypeOf(obj);
  if (prototype === null) {
    return obj as Record<string, string>;
  }

  if (prototype === Object.prototype && Object.isExtensible(obj)) {
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "object" && value !== null) {
        return flattenNestedObject(obj);
      }
    }

    Object.setPrototypeOf(obj, null);
    return obj as Record<string, string>;
  }

  const keys = Object.keys(obj);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      return flattenNestedObject(obj);
    }
  }

  const result: Record<string, string> = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    result[key] = obj[key];
  }

  return result;
}
