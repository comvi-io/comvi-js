import type { FlattenedMessages } from "../types";

/** Nested `Map<locale, Map<namespace, translations>>` storage. */
export class MessagesCache {
  private _cache = new Map<string, Map<string, FlattenedMessages>>();
  private _defaultNs: string;
  private _revision = 0;
  /**
   * Lazily built, invalidated on any mutation. Framework bindings rely on the
   * reference being STABLE between revisions — React excludes it from memo deps
   * and uses `getRevision()` for change detection.
   */
  private _flatSnapshot: Map<string, FlattenedMessages> | null = null;

  constructor(options?: { defaultNs?: string }) {
    this._defaultNs = options?.defaultNs ?? "default";
  }

  get(locale: string, namespace?: string): FlattenedMessages | undefined {
    return this._cache.get(locale)?.get(namespace ?? this._defaultNs);
  }

  set(locale: string, namespace: string, translations: FlattenedMessages): void {
    let localeMap = this._cache.get(locale);
    if (!localeMap) {
      localeMap = new Map();
      this._cache.set(locale, localeMap);
    }

    localeMap.set(namespace, translations);
    this._flatSnapshot = null;
    this._revision++;
  }

  has(locale: string, namespace?: string): boolean {
    return this._cache.get(locale)?.has(namespace ?? this._defaultNs) === true;
  }

  /** An omitted `namespace` deletes every namespace for the locale. */
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
      this._cache.delete(locale);
    }
    this._flatSnapshot = null;
    this._revision++;
  }

  clear(): void {
    this._cache.clear();
    this._flatSnapshot = null;
    this._revision++;
  }

  getLocales(): string[] {
    return [...this._cache.keys()];
  }

  /** Keys in `"locale:namespace"` format. */
  keys(): IterableIterator<string> {
    return this._getFlatSnapshot().keys();
  }

  /** Number of cached locale-namespace combinations. */
  get size(): number {
    let count = 0;
    for (const nsMap of this._cache.values()) count += nsMap.size;
    return count;
  }

  /** A detached copy — callers may mutate it without touching the internal snapshot. */
  clone(): Map<string, FlattenedMessages> {
    return new Map(this._getFlatSnapshot());
  }

  private _getFlatSnapshot(): Map<string, FlattenedMessages> {
    if (this._flatSnapshot !== null) return this._flatSnapshot;

    const result = new Map<string, FlattenedMessages>();
    for (const [lang, nsMap] of this._cache) {
      for (const [ns, translations] of nsMap) {
        result.set(`${lang}:${ns}`, translations);
      }
    }
    this._flatSnapshot = result;
    return result;
  }

  /**
   * The flat snapshot used by framework bindings; the reference is stable
   * between revisions. Readonly is enforced at the TYPE level only — mutating
   * it corrupts the cache.
   * @internal
   */
  getInternalMap(): ReadonlyMap<string, FlattenedMessages> {
    return this._getFlatSnapshot();
  }

  /** Bumped on every mutation; framework bindings use it for change detection. */
  getRevision(): number {
    return this._revision;
  }
}
