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

/**
 * Contexts that already carry an end-of-response hook. The WeakMap above makes
 * the hosts COLLECTABLE, which is not the same as destroyed: a plugin's cleanup
 * (an interval, a socket, a subscription) runs only when someone calls
 * `destroy()`, and on the server nobody did.
 */
const cleanupHooked = new WeakSet<object>();

const getContextKey = (event: H3Event): object => {
  if (event.context && typeof event.context === "object") {
    return event.context as object;
  }
  return event as unknown as object;
};

/**
 * Tear down every host this request built, once the response is off the wire.
 *
 * A rejected creation promise has no host to destroy and is skipped — the
 * rejection was already delivered to the caller that asked for that locale.
 * A `destroy()` that rejects is reported through the host's own error channel:
 * the response is written by now, so there is nowhere else for it to go, and
 * throwing here would surface as an unhandled rejection in the server process.
 */
async function destroyRequestHosts(contextKey: object): Promise<void> {
  const localeInstances = requestI18nMap.get(contextKey);
  if (!localeInstances) return;
  requestI18nMap.delete(contextKey);
  const pending = [...localeInstances.values()];
  localeInstances.clear();

  for (const instancePromise of pending) {
    let i18n: NuxtServerHost;
    try {
      i18n = await instancePromise;
    } catch {
      continue;
    }
    try {
      await i18n.destroy();
    } catch (error) {
      try {
        i18n.reportError(error instanceof Error ? error : new Error(String(error)), {
          source: "request-cleanup",
        });
      } catch {
        // A reporter that throws must not take the process down either.
      }
    }
  }
}

/**
 * One hook per request, on `close`.
 *
 * `finish` fires only for a response that was written in full, and `end` is not
 * an event on the response at all; `close` fires exactly once for a finished,
 * an aborted and an errored response alike — and always AFTER the response is
 * off the wire, which is what makes it safe for a streamed render that reads
 * the host until its last chunk.
 *
 * A web-only event (no `event.node.res`) has nothing to hang this off, so it
 * registers nothing rather than guessing; the hosts stay collectable, exactly
 * as they were before this hook existed.
 */
function hookRequestCleanup(event: H3Event, contextKey: object): void {
  if (cleanupHooked.has(contextKey)) return;
  const res = event.node?.res;
  if (typeof res?.once !== "function") return;
  cleanupHooked.add(contextKey);
  res.once("close", () => {
    void destroyRequestHosts(contextKey);
  });
}

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
        // Symmetric with the app plugin: the inline catalog is what makes an
        // app with no `hostModule` (and therefore no loader) render anything at
        // all, so SSR must construct with the same one the client does.
        translation: publicConfig.translation,
        // Symmetric with the app plugin (runtime/plugin.ts): a server route that
        // renders rich text off the request host keeps the same whitelist the
        // client render used. `ssrLocale` stays client-only.
        tagInterpolation: publicConfig.basicHtmlTags
          ? { basicHtmlTags: publicConfig.basicHtmlTags }
          : undefined,
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
        // The server utility's `i18n` IS the host.
        core: i18n,
        event,
        runtime: "server",
        runtimeConfig: config,
      });

      await i18n.init();
      return i18n;
    })();

    localeInstances.set(locale, instancePromise);
    // After the map holds something worth destroying, so the hook can never
    // fire against an empty request.
    hookRequestCleanup(event, contextKey);
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
