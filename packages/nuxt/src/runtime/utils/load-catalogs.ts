import { hasLoaderApi } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";

/**
 * In-flight loads per host and `locale:namespace`. Core's `reloadTranslations`
 * cancels and restarts a pair that is already loading, so concurrent callers
 * share the first one's promise here instead of fetching the pair twice.
 */
const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const pendingLoads = new WeakMap<WrapperI18nHost, Record<string, Promise<void> | undefined>>();

/**
 * Load `namespaces` (default: the active ones) for `locale` and every locale of
 * the host's `fallbackLocale` chain, in core's lookup order, skipping every
 * pair already in the cache. Without `locale`, the fallback chain minus the
 * host's current locale: core's own activation or locale switch loads that one,
 * and a reload here would cancel and refetch it.
 *
 * A failure has already reached `onError` and `loadError` through core; it is
 * logged here and swallowed, so the render continues without that catalog. The
 * payload then lacks it too, and SSR and the client agree.
 *
 * A host without the loader capability, or with none registered, has nothing
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
  const pending: Array<Promise<void>> = [];
  const fallbacks = i18n.getFallbackLocales();
  const locales = locale ? [locale, ...fallbacks] : fallbacks.filter((loc) => loc !== i18n.locale);
  for (const loc of new Set(locales)) {
    for (const ns of namespaces ?? i18n.getActiveNamespaces()) {
      const key = `${loc}:${ns}`;
      if (!i18n.hasLocale(loc, ns)) {
        pending.push(
          (loads[key] ??= i18n
            .reloadTranslations(loc, ns)
            .catch((error: unknown) => {
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
