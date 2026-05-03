import type { I18n } from "@comvi/core";
import { createI18n } from "@comvi/core";
import type { H3Event } from "h3";
import { runComviSetup } from "#build/comvi.setup";
import { getServerRuntimeConfig } from "./runtime-config";

// Keep one i18n instance per locale within a single request.
// This costs more than a single shared request instance, but it preserves
// SSR correctness when server code resolves multiple locales concurrently.
const requestI18nMap = new WeakMap<object, Map<string, Promise<I18n>>>();

const getContextKey = (event: H3Event): object => {
  if (event.context && typeof event.context === "object") {
    return event.context as object;
  }
  return event as unknown as object;
};

/**
 * Get or create per-request i18n instance.
 * Uses WeakMap with event context as key for automatic cleanup.
 */
export async function getRequestI18n(event: H3Event, locale: string): Promise<I18n> {
  const contextKey = getContextKey(event);
  let localeInstances = requestI18nMap.get(contextKey);
  if (!localeInstances) {
    localeInstances = new Map<string, Promise<I18n>>();
    requestI18nMap.set(contextKey, localeInstances);
  }

  let instancePromise = localeInstances.get(locale);

  if (!instancePromise) {
    instancePromise = (async () => {
      const config = getServerRuntimeConfig(event);
      const publicConfig = config.public.comvi;
      const privateConfig = config.comvi;

      const i18n = createI18n({
        locale: locale,
        fallbackLocale: publicConfig.fallbackLanguage || publicConfig.defaultLocale || locale,
        defaultNs: publicConfig.defaultNs || "default",
        devMode: process.env.NODE_ENV === "development",
        apiKey: privateConfig?.apiKey,
      });

      await runComviSetup({
        i18n,
        event,
        runtime: "server",
        runtimeConfig: config,
      });

      await i18n.init();
      return i18n;
    })();

    localeInstances.set(locale, instancePromise);
  }

  let i18n: I18n;
  try {
    i18n = await instancePromise;
  } catch (error) {
    if (localeInstances.get(locale) === instancePromise) {
      localeInstances.delete(locale);
      if (localeInstances.size === 0 && requestI18nMap.get(contextKey) === localeInstances) {
        requestI18nMap.delete(contextKey);
      }
    }
    throw error;
  }

  if (i18n.locale !== locale) {
    await i18n.setLocaleAsync(locale);
  }

  return i18n;
}
