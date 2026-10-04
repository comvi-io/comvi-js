import type { TranslationValue } from "@comvi/core";
import { resolveServerI18n, getRequestFailedLoads } from "./cache";
import { ensureInitialized } from "./ensureInitialized";
import type { ServerI18nHost } from "./hostTypes";

export interface LoadMessagesOptions {
  /**
   * Namespaces to load. Defaults to default namespace only.
   */
  namespaces?: string[];
}

/**
 * Translations result keyed by "locale:namespace"
 */
export type MessagesMap = Record<string, Record<string, TranslationValue>>;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const noLoaderWarnings = new WeakSet<ServerI18nHost>();
const NO_LOADER_WARNING_MESSAGE =
  "[@comvi/next] No loader registered, so SSR loaded nothing. " +
  "Register one via i18n.registerLoader(...), or compose one onto the host: " +
  "createNextI18n(...).i18n.use(fetchLoader(...)).";

const toPlainObject = (
  value: Record<string, TranslationValue>,
): Record<string, TranslationValue> => {
  // Next.js Server -> Client serialization rejects null-prototype objects.
  return Object.fromEntries(Object.entries(value)) as Record<string, TranslationValue>;
};

const warnNoLoaderConfigured = (i18n: ServerI18nHost): void => {
  if (noLoaderWarnings.has(i18n)) {
    return;
  }
  noLoaderWarnings.add(i18n);
  console.warn(NO_LOADER_WARNING_MESSAGE);
};

/**
 * In-flight loads per host and `locale:namespace`. Core's `reloadMessages`
 * cancels and restarts a pair that is already loading, so concurrent requests
 * share the first one's promise here instead of fetching the pair twice.
 */
const pendingLoads = new WeakMap<ServerI18nHost, Map<string, Promise<void>>>();

const loadPair = (i18n: ServerI18nHost, locale: string, namespace: string): Promise<void> => {
  if (i18n.hasLocale(locale, namespace)) {
    return Promise.resolve();
  }
  let pending = pendingLoads.get(i18n);
  if (!pending) {
    pending = new Map();
    pendingLoads.set(i18n, pending);
  }
  const key = `${locale}:${namespace}`;
  let load = pending.get(key);
  if (!load) {
    const loads = pending;
    // Reuse core loading pipeline (events, error handling). A failure has
    // already reached `onError` and `loadError`; the render continues without
    // the catalog, and the client gets the same catalogs, so both sides agree.
    load = i18n
      .reloadMessages(locale, namespace)
      .catch((error: unknown) => {
        console.warn(`[@comvi/next] Failed to load ${key}:`, toError(error).message);
      })
      .finally(() => {
        loads.delete(key);
      });
    pending.set(key, load);
  }
  return load;
};

/**
 * Load `namespaces` for `locales`, skipping every cached pair. Without a loader
 * there is nothing to load; that is said once per host when none of the pairs
 * is cached either. Nothing missing, nothing touched. A pair that failed earlier
 * in the same request is not retried: the render already went without it, and
 * the client must get the same catalogs the server read.
 *
 * @internal Shared by `loadMessages()` and `getI18n()`.
 */
export const loadChain = async (
  i18n: ServerI18nHost,
  locales: readonly string[],
  namespaces: readonly string[],
): Promise<void> => {
  const failed = getRequestFailedLoads();
  const missing = locales.flatMap((loc) =>
    namespaces
      .filter((ns) => !i18n.hasLocale(loc, ns) && !failed.has(`${loc}:${ns}`))
      .map((ns) => [loc, ns] as const),
  );
  if (missing.length === 0) {
    return;
  }
  if (i18n.getLoader()) {
    await Promise.all(missing.map(([loc, ns]) => loadPair(i18n, loc, ns)));
    for (const [loc, ns] of missing) {
      if (!i18n.hasLocale(loc, ns)) failed.add(`${loc}:${ns}`);
    }
  } else if (missing.length === locales.length * namespaces.length) {
    warnNoLoaderConfigured(i18n);
  }
};

/**
 * Load translations for a locale using the configured i18n loader.
 *
 * The result holds the requested locale AND every locale of the host's
 * `fallbackLocale` chain, for each requested namespace, so a key the server
 * rendered from a fallback catalog resolves identically after hydration.
 *
 * If no loader is configured, this function returns already-cached translations
 * for requested namespaces (if any) and logs a warning.
 *
 * @example
 * ```typescript
 * const messages = await loadMessages(locale);
 * ```
 *
 * @example
 * ```typescript
 * const messages = await loadMessages(locale, {
 *   namespaces: ["common", "admin"],
 * });
 * ```
 */
export async function loadMessages(
  locale: string,
  options: LoadMessagesOptions = {},
): Promise<MessagesMap> {
  const i18n = resolveServerI18n();

  // Auto-initialize so plugins can register loaders
  await ensureInitialized(i18n);

  const defaultNs = i18n.getDefaultNamespace();
  const namespaces = options.namespaces ?? [defaultNs];

  // The client hydrates from these catalogs alone, so ship every catalog the
  // server render could have read: the requested locale, then its fallback
  // chain in the order core's lookup walks it. A missing fallback catalog would
  // make the client render the raw key where the server rendered the fallback.
  const locales = [...new Set([locale, ...i18n.getFallbackLocales()])];
  await loadChain(i18n, locales, namespaces);

  const result: MessagesMap = {};
  for (const loc of locales) {
    for (const namespace of namespaces) {
      if (i18n.hasLocale(loc, namespace)) {
        const translations = i18n.getMessages(loc, namespace) as Record<string, TranslationValue>;
        result[`${loc}:${namespace}`] = toPlainObject(translations);
      }
    }
  }

  return result;
}
