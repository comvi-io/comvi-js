import type { FlattenedTranslations } from "../types";

class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
  constructor(private readonly _map: Map<K, V>) {}

  get size(): number {
    return this._map.size;
  }

  get(key: K): V | undefined {
    return this._map.get(key);
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this._map.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  entries(): MapIterator<[K, V]> {
    return this._map.entries();
  }

  keys(): MapIterator<K> {
    return this._map.keys();
  }

  values(): MapIterator<V> {
    return this._map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this._map[Symbol.iterator]();
  }
}

/**
 * TranslationCache encapsulates translation storage with a clear API.
 * Uses nested Map<locale, Map<namespace, translations>> for fast lookups.
 */
export class TranslationCache {
  private _cache = new Map<string, Map<string, FlattenedTranslations>>();
  private _defaultNs: string;
  private _revision = 0;
  /**
   * Lazily-built flat snapshot of the cache. Invalidated on any mutation.
   * Framework bindings rely on this being referentially stable between revisions
   * (React excludes it from memo deps and uses getRevision() for change detection).
   */
  private _flatSnapshot: Map<string, FlattenedTranslations> | null = null;
  private _readonlyFlatSnapshot: ReadonlyMap<string, FlattenedTranslations> | null = null;

  constructor(options?: { defaultNs?: string }) {
    this._defaultNs = options?.defaultNs ?? "default";
  }

  /**
   * Get translations for a specific locale and namespace
   */
  get(locale: string, namespace?: string): FlattenedTranslations | undefined {
    return this._cache.get(locale)?.get(namespace ?? this._defaultNs);
  }

  /**
   * Set translations for a specific locale and namespace
   * @param locale - The locale code
   * @param namespace - The namespace
   * @param translations - The flattened translations
   */
  set(locale: string, namespace: string, translations: FlattenedTranslations): void {
    let localeMap = this._cache.get(locale);
    if (!localeMap) {
      localeMap = new Map();
      this._cache.set(locale, localeMap);
    }

    localeMap.set(namespace, translations);
    this._flatSnapshot = null;
    this._readonlyFlatSnapshot = null;
    this._revision++;
  }

  /**
   * Check if translations exist for a specific locale and namespace
   */
  has(locale: string, namespace?: string): boolean {
    return this._cache.get(locale)?.has(namespace ?? this._defaultNs) === true;
  }

  /**
   * Delete translations for a specific locale and namespace, or all namespaces for a locale
   * @param locale - The locale code
   * @param namespace - Optional namespace (if omitted, deletes all namespaces for the locale)
   */
  delete(locale: string, namespace?: string): void {
    if (namespace !== undefined) {
      const localeMap = this._cache.get(locale);
      if (localeMap) {
        localeMap.delete(namespace);
        if (localeMap.size === 0) {
          this._cache.delete(locale);
        }
      }
    } else {
      const localeMap = this._cache.get(locale);
      if (localeMap) {
        this._cache.delete(locale);
      }
    }
    this._flatSnapshot = null;
    this._readonlyFlatSnapshot = null;
    this._revision++;
  }

  /**
   * Clear all translations from the cache
   */
  clear(): void {
    this._cache.clear();
    this._flatSnapshot = null;
    this._readonlyFlatSnapshot = null;
    this._revision++;
  }

  /**
   * Get all locale codes that have translations loaded
   */
  getLocales(): string[] {
    return [...this._cache.keys()];
  }

  /**
   * Get all cache keys in "locale:namespace" format
   */
  keys(): IterableIterator<string> {
    return this._getFlatSnapshot().keys();
  }

  /**
   * Get the number of cached locale-namespace combinations
   */
  get size(): number {
    let count = 0;
    for (const nsMap of this._cache.values()) count += nsMap.size;
    return count;
  }

  /**
   * Get a detached flat Map copy of the cache.
   * Safe for callers to mutate without affecting the cached snapshot used internally.
   */
  clone(): Map<string, FlattenedTranslations> {
    return new Map(this._getFlatSnapshot());
  }

  private _getFlatSnapshot(): Map<string, FlattenedTranslations> {
    if (this._flatSnapshot !== null) return this._flatSnapshot;

    const result = new Map<string, FlattenedTranslations>();
    for (const [lang, nsMap] of this._cache) {
      for (const [ns, translations] of nsMap) {
        result.set(`${lang}:${ns}`, translations);
      }
    }
    this._flatSnapshot = result;
    return result;
  }

  /**
   * Get a readonly flat snapshot used by framework bindings.
   * The snapshot reference is stable between revisions and cannot be mutated at runtime.
   * @internal
   */
  getInternalMap(): ReadonlyMap<string, FlattenedTranslations> {
    let snapshot = this._readonlyFlatSnapshot;
    if (snapshot !== null) return snapshot;

    snapshot = new ReadonlyMapView(this._getFlatSnapshot());
    this._readonlyFlatSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Get the current revision number
   * Used by framework bindings for efficient change detection
   */
  getRevision(): number {
    return this._revision;
  }
}
