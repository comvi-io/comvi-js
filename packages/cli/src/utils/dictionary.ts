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

/**
 * A null-prototype copy of one untrusted map. `Object.assign` copies own
 * enumerable keys only, and a `__proto__` key lands as data because the target
 * has no inherited setter to intercept it.
 */
export function dictionaryFrom<T>(source: Record<string, T>): Record<string, T> {
  return Object.assign(emptyDictionary<T>(), source);
}

/**
 * Whether `key` is the map's own entry rather than something inherited from a
 * prototype. `key in map` and `map[key]` both answer for `constructor`,
 * `toString` and every other member of `Object.prototype`, which is wrong for
 * a map whose keys are data.
 *
 * `Object.prototype.hasOwnProperty.call` rather than `Object.hasOwn`: the
 * package compiles against the ES2020 lib, and it also works on a map that has
 * no prototype of its own.
 */
export function hasOwnKey(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}
