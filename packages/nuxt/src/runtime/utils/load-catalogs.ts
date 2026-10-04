import { hasLoaderApi } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";

/**
 * In-flight loads per instance and `locale:namespace`. Core's `reloadMessages`
 * cancels and restarts a pair that is already loading, so concurrent callers
 * share the first one's promise here instead of fetching the pair twice.
 */
const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const pendingLoads = new WeakMap<WrapperI18nHost, Record<string, Promise<void> | undefined>>();

/**
 * Pairs whose load failed on an instance. Every server instance is the request's own,
 * so this is per request: a failed pair is not retried before the request
 * ends, because the render already went without it and the payload must carry
 * what the render read.
 */
const failedLoads = new WeakMap<WrapperI18nHost, Set<string>>();

/**
 * Load `namespaces` (default: the active ones) for `locale` and every locale of
 * the instance's `fallbackLocale` chain, in core's lookup order, skipping every
 * pair already in the cache. Without `locale`, the fallback chain minus the
 * instance's current locale: core's own activation or locale switch loads that one,
 * and a reload here would cancel and refetch it.
 *
 * A failure has already reached `onError` and `loadError` through core; it is
 * logged here and swallowed, so the render continues without that catalog. The
 * payload then lacks it too, and SSR and the client agree.
 *
 * An instance without the loader capability, or with none registered, has nothing
 * to load: whatever `comvi.setup` put in the catalog is already there.
 */
export async function loadCatalogs(
  i18n: WrapperI18nHost,
  namespaces?: readonly string[],
  locale?: string,
): Promise<void> {
  if (!hasLoaderApi(i18n) || !i18n.getLoader()) {
    return;
  }
  let loads = pendingLoads.get(i18n);
  if (!loads) {
    pendingLoads.set(i18n, (loads = {}));
  }
  const failed = failedLoads.get(i18n) ?? new Set<string>();
  failedLoads.set(i18n, failed);
  const pending: Array<Promise<void>> = [];
  const fallbacks = i18n.getFallbackLocales();
  const locales = locale ? [locale, ...fallbacks] : fallbacks.filter((loc) => loc !== i18n.locale);
  for (const loc of new Set(locales)) {
    for (const ns of namespaces ?? i18n.getActiveNamespaces()) {
      const key = `${loc}:${ns}`;
      if (!i18n.hasLocale(loc, ns) && !failed.has(key)) {
        pending.push(
          (loads[key] ??= i18n
            .reloadMessages(loc, ns)
            .catch((error: unknown) => {
              failed.add(key);
              console.warn(`[@comvi/nuxt] Failed to load ${key}:`, toError(error).message);
            })
            .finally(() => {
              delete loads[key];
            })),
        );
      }
    }
  }
  await Promise.all(pending);
}
