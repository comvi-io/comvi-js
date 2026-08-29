import type { H3Event } from "h3";
import { runComviSetup } from "#build/comvi.setup";
// Same build-time branch as the client plugin: with `hostModule` set, the
// generated template returns the app's own composed host and nuxt's default
// `@comvi/vue` construction path is not in the server graph.
import { createComviCore } from "#build/comvi.host";
import type { NuxtServerHost } from "../../../types";
import { getServerRuntimeConfig } from "./runtime-config";

// Keep one i18n instance per locale within a single request.
// This costs more than a single shared request instance, but it preserves
// SSR correctness when server code resolves multiple locales concurrently.
const requestI18nMap = new WeakMap<object, Map<string, Promise<NuxtServerHost>>>();

const getContextKey = (event: H3Event): object => {
  if (event.context && typeof event.context === "object") {
    return event.context as object;
  }
  return event as unknown as object;
};

/** Keyed by event context in a WeakMap, so cleanup is automatic. */
export async function getRequestI18n(event: H3Event, locale: string): Promise<NuxtServerHost> {
  const contextKey = getContextKey(event);
  let localeInstances = requestI18nMap.get(contextKey);
  if (!localeInstances) {
    localeInstances = new Map<string, Promise<NuxtServerHost>>();
    requestI18nMap.set(contextKey, localeInstances);
  }

  let instancePromise = localeInstances.get(locale);

  if (!instancePromise) {
    instancePromise = (async () => {
      const config = getServerRuntimeConfig(event);
      const publicConfig = config.public.comvi;
      const privateConfig = config.comvi;

      const baseI18nOptions = {
        locale: locale,
        fallbackLocale: publicConfig.fallbackLocale || publicConfig.defaultLocale || locale,
        defaultNs: publicConfig.defaultNs || "default",
        devMode: process.env.NODE_ENV === "development",
        apiKey: privateConfig?.apiKey,
      };
      const i18n = publicConfig.defaultParams
        ? createComviCore({ ...baseI18nOptions, defaultParams: publicConfig.defaultParams })
        : createComviCore(baseI18nOptions);

      // Both branches now receive the request locale in their options — the
      // default branch constructs core with it, and a `hostModule` factory is
      // handed the same resolved options — so this is a no-op for any factory
      // that forwards them. It stays because the factory is free to ignore
      // them, and a host on the wrong locale would load the wrong catalog:
      // corrected here, before init(), so the first load is already right.
      if (i18n.locale !== locale) {
        i18n.locale = locale;
      }

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

  let i18n: NuxtServerHost;
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
