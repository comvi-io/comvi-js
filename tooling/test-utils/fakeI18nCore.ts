import type {
  ErrorReportContext,
  I18nEvent,
  I18nEventData,
  TranslationParams,
  TranslationResult,
} from "@comvi/core";

type Listener = (payload: unknown) => void;

type TranslationTable = Record<string, unknown>;

export type FakeI18nCoreOptions = {
  language?: string;
  defaultNamespace?: string;
  tImplementation?: (key: string, params?: TranslationParams) => TranslationResult;
};

const normalizeLanguageNamespace = (
  composite: string,
  defaultNamespace: string,
): { language: string; namespace: string } => {
  const separator = composite.indexOf(":");
  if (separator === -1) {
    return { language: composite, namespace: defaultNamespace };
  }
  return {
    language: composite.slice(0, separator),
    namespace: composite.slice(separator + 1),
  };
};

export class FakeTranslationCache {
  private revision = 0;
  private readonly cache = new Map<string, TranslationTable>();

  getRevision(): number {
    return this.revision;
  }

  getInternalMap(): Map<string, TranslationTable> {
    return this.cache;
  }

  set(language: string, namespace: string, data: TranslationTable): void {
    const mapKey = `${language}:${namespace}`;
    const previous = this.cache.get(mapKey) ?? {};
    this.cache.set(mapKey, { ...previous, ...data });
    this.revision += 1;
  }

  clear(language?: string, namespace?: string): void {
    if (language === undefined && namespace === undefined) {
      this.cache.clear();
      this.revision += 1;
      return;
    }

    for (const key of Array.from(this.cache.keys())) {
      const separator = key.indexOf(":");
      const lang = key.slice(0, separator);
      const ns = key.slice(separator + 1);
      const languageMatches = language === undefined || language === lang;
      const namespaceMatches = namespace === undefined || namespace === ns;
      if (languageMatches && namespaceMatches) {
        this.cache.delete(key);
      }
    }

    this.revision += 1;
  }

  hasLanguage(language: string, namespace?: string): boolean {
    if (namespace) {
      return this.cache.has(`${language}:${namespace}`);
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${language}:`)) {
        return true;
      }
    }
    return false;
  }

  hasTranslation(key: string, language: string, namespace: string): boolean {
    const table = this.cache.get(`${language}:${namespace}`);
    return Object.prototype.hasOwnProperty.call(table ?? {}, key);
  }

  getLoadedLanguages(): string[] {
    const languages = new Set<string>();
    for (const key of this.cache.keys()) {
      languages.add(key.split(":")[0]);
    }
    return Array.from(languages);
  }
}

export class FakeI18nCore {
  private readonly listeners = new Map<I18nEvent, Set<Listener>>();
  private readonly activeNamespaces: Set<string>;
  private readonly cache = new FakeTranslationCache();
  private _language: string;
  private _isLoading = false;
  private _isInitializing = false;
  private _isInitialized = false;
  private readonly defaultNamespace: string;
  private _tImplementation: (key: string, params?: TranslationParams) => TranslationResult;

  public initError: unknown = null;
  public namespaceLoadResult: Promise<void> = Promise.resolve();
  public lastFallbackLanguage: string | string[] | null = null;

  constructor(options: FakeI18nCoreOptions = {}) {
    this._language = options.language ?? "en";
    this.defaultNamespace = options.defaultNamespace ?? "default";
    this.activeNamespaces = new Set<string>([this.defaultNamespace]);
    this._tImplementation =
      options.tImplementation ??
      ((key: string, params?: TranslationParams): TranslationResult => {
        const ns = (params?.ns as string | undefined) ?? this.defaultNamespace;
        const value = this.cache.getInternalMap().get(`${this._language}:${ns}`)?.[key];
        return (value as TranslationResult | undefined) ?? params?.fallback ?? key;
      });
  }

  get language(): string {
    return this._language;
  }

  set language(value: string) {
    this._language = value;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  set isLoading(value: boolean) {
    this._isLoading = value;
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  set isInitializing(value: boolean) {
    this._isInitializing = value;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  set isInitialized(value: boolean) {
    this._isInitialized = value;
  }

  get translationCache(): FakeTranslationCache {
    return this.cache;
  }

  get tImplementation(): (key: string, params?: TranslationParams) => TranslationResult {
    return this._tImplementation;
  }

  setTImplementation(fn: (key: string, params?: TranslationParams) => TranslationResult): void {
    this._tImplementation = fn;
  }

  async init(): Promise<void> {
    this._isInitializing = true;
    this.emit("loadingStateChanged", { isLoading: this._isLoading, isInitializing: true });
    await Promise.resolve();

    if (this.initError !== null) {
      this._isInitializing = false;
      this.emit("loadingStateChanged", { isLoading: this._isLoading, isInitializing: false });
      throw this.initError;
    }

    this._isInitialized = true;
    this._isInitializing = false;
    this.emit("initialized", undefined);
    this.emit("loadingStateChanged", { isLoading: this._isLoading, isInitializing: false });
  }

  async setLanguageAsync(language: string): Promise<void> {
    return this.setLocaleAsync(language);
  }

  async setLocaleAsync(locale: string): Promise<void> {
    const from = this._language;
    this._language = locale;
    this.emit("localeChanged", { from, to: locale });
  }

  addTranslations(translations: Record<string, TranslationTable>): void {
    for (const [languageOrComposite, values] of Object.entries(translations)) {
      const { language, namespace } = normalizeLanguageNamespace(
        languageOrComposite,
        this.defaultNamespace,
      );
      this.cache.set(language, namespace, values);
      this.emit("namespaceLoaded", { language, namespace });
    }
  }

  async addActiveNamespace(namespace: string): Promise<void> {
    this.activeNamespaces.add(namespace);
    this._isLoading = true;
    this.emit("loadingStateChanged", { isLoading: true, isInitializing: this._isInitializing });
    await this.namespaceLoadResult;
    this._isLoading = false;
    this.emit("namespaceLoaded", { language: this._language, namespace });
    this.emit("loadingStateChanged", { isLoading: false, isInitializing: this._isInitializing });
  }

  async reloadTranslations(_language?: string, _namespace?: string): Promise<void> {
    return Promise.resolve();
  }

  clearTranslations(language?: string, namespace?: string): void {
    this.cache.clear(language, namespace);
    this.emit("translationsCleared", { language, namespace });
  }

  setFallbackLanguage(fallback: string | string[]): void {
    this.lastFallbackLanguage = fallback;
  }

  onMissingKey(
    _callback: (key: string, language: string, namespace: string) => TranslationResult | void,
  ): () => void {
    return () => {};
  }

  onLoadError(_callback: (language: string, namespace: string, error: Error) => void): () => void {
    return () => {};
  }

  reportError(_error: unknown, _context?: ErrorReportContext): void {
    return;
  }

  hasLanguage(language: string, namespace?: string): boolean {
    return this.cache.hasLanguage(language, namespace);
  }

  getLoadedLanguages(): string[] {
    return this.cache.getLoadedLanguages();
  }

  getActiveNamespaces(): string[] {
    return Array.from(this.activeNamespaces);
  }

  getDefaultNamespace(): string {
    return this.defaultNamespace;
  }

  getTranslations(): Record<string, TranslationTable> {
    const result: Record<string, TranslationTable> = {};
    for (const [key, value] of this.cache.getInternalMap().entries()) {
      result[key] = { ...value };
    }
    return result;
  }

  t(key: string, params?: TranslationParams): TranslationResult {
    return this._tImplementation(key, params);
  }

  hasTranslation(
    key: string,
    language?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ): boolean {
    const targetLanguage = language ?? this._language;
    const targetNamespace = namespace ?? this.defaultNamespace;
    if (this.cache.hasTranslation(key, targetLanguage, targetNamespace)) {
      return true;
    }

    if (!checkFallbacks || this.lastFallbackLanguage === null) {
      return false;
    }

    const fallbacks = Array.isArray(this.lastFallbackLanguage)
      ? this.lastFallbackLanguage
      : [this.lastFallbackLanguage];
    return fallbacks.some((fallbackLanguage) =>
      this.cache.hasTranslation(key, fallbackLanguage, targetNamespace),
    );
  }

  on<E extends I18nEvent>(event: E, callback: (payload: I18nEventData[E]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(callback as Listener);
    this.listeners.set(event, set);

    return () => {
      set.delete(callback as Listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit<E extends I18nEvent>(event: E, payload: I18nEventData[E]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) {
      return;
    }
    callbacks.forEach((listener) => listener(payload));
  }

  listenerCount(event: I18nEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
