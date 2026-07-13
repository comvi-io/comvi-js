import type { FlattenedTranslations } from "../types";

/**
 * TranslationCache encapsulates translation storage with a clear API.
 * Uses nested Map<locale, Map<namespace, translations>> for fast lookups.
 */
export class TranslationCache {
  #cache = new Map<string, Map<string, FlattenedTranslations>>();
  #defaultNs: string;
  #revision = 0;
  /**
   * Lazily-built flat snapshot of the cache. Invalidated on any mutation.
   * Framework bindings rely on this being referentially stable between revisions
   * (React excludes it from memo deps and uses getRevision() for change detection).
   */
  #flatSnapshot: Map<string, FlattenedTranslations> | null = null;

  constructor(options?: { defaultNs?: string }) {
    this.#defaultNs = options?.defaultNs ?? "default";
  }

  /**
   * Get translations for a specific locale and namespace
   */
  get(locale: string, namespace?: string): FlattenedTranslations | undefined {
    return this.#cache.get(locale)?.get(namespace ?? this.#defaultNs);
  }

  /**
   * Set translations for a specific locale and namespace
   * @param locale - The locale code
   * @param namespace - The namespace
   * @param translations - The flattened translations
   */
  set(locale: string, namespace: string, translations: FlattenedTranslations): void {
    let localeMap = this.#cache.get(locale);
    if (!localeMap) {
      localeMap = new Map();
      this.#cache.set(locale, localeMap);
    }

    localeMap.set(namespace, translations);
    this.#flatSnapshot = null;
    this.#revision++;
  }

  /**
   * Check if translations exist for a specific locale and namespace
   */
  has(locale: string, namespace?: string): boolean {
    return this.#cache.get(locale)?.has(namespace ?? this.#defaultNs) === true;
  }

  /**
   * Delete translations for a specific locale and namespace, or all namespaces for a locale
   * @param locale - The locale code
   * @param namespace - Optional namespace (if omitted, deletes all namespaces for the locale)
   */
  delete(locale: string, namespace?: string): void {
    if (namespace !== undefined) {
      const localeMap = this.#cache.get(locale);
      if (localeMap) {
        localeMap.delete(namespace);
        if (localeMap.size === 0) {
          this.#cache.delete(locale);
        }
      }
    } else {
      this.#cache.delete(locale);
    }
    this.#flatSnapshot = null;
    this.#revision++;
  }

  /**
   * Clear all translations from the cache
   */
  clear(): void {
    this.#cache.clear();
    this.#flatSnapshot = null;
    this.#revision++;
  }

  /**
   * Get all locale codes that have translations loaded
   */
  getLocales(): string[] {
    return [...this.#cache.keys()];
  }

  /**
   * Get all cache keys in "locale:namespace" format
   */
  keys(): IterableIterator<string> {
    return this.#getFlatSnapshot().keys();
  }

  /**
   * Get the number of cached locale-namespace combinations
   */
  get size(): number {
    let count = 0;
    for (const nsMap of this.#cache.values()) count += nsMap.size;
    return count;
  }

  /**
   * Get a detached flat Map copy of the cache.
   * Safe for callers to mutate without affecting the cached snapshot used internally.
   */
  clone(): Map<string, FlattenedTranslations> {
    return new Map(this.#getFlatSnapshot());
  }

  #getFlatSnapshot(): Map<string, FlattenedTranslations> {
    if (this.#flatSnapshot !== null) return this.#flatSnapshot;

    const result = new Map<string, FlattenedTranslations>();
    for (const [lang, nsMap] of this.#cache) {
      for (const [ns, translations] of nsMap) {
        result.set(`${lang}:${ns}`, translations);
      }
    }
    this.#flatSnapshot = result;
    return result;
  }

  /**
   * Get a readonly flat snapshot used by framework bindings.
   * The snapshot reference is stable between revisions. Readonly is enforced
   * at the type level only — do not mutate.
   * @internal
   */
  getInternalMap(): ReadonlyMap<string, FlattenedTranslations> {
    return this.#getFlatSnapshot();
  }

  /**
   * Get the current revision number
   * Used by framework bindings for efficient change detection
   */
  getRevision(): number {
    return this.#revision;
  }
}
