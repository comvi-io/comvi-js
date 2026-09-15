/**
 * A map whose keys come from data the CLI does not control — locale and
 * namespace names from the TMS response, or from local file names.
 *
 * `Object.prototype` is not on the lookup chain, so a key named `__proto__`,
 * `constructor` or `prototype` is an ordinary entry: reading it cannot reach
 * the shared prototype, and writing it cannot mutate it. On a plain `{}`,
 * `map["__proto__"] ??= {}` finds `Object.prototype` instead of "no entry
 * yet", and the following write lands on every object in the process.
 */
export function emptyDictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
