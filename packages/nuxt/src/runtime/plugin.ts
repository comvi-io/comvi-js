import { defineNuxtPlugin, useRuntimeConfig, useCookie } from "#app";
import { useLocaleState } from "./utils/locale-state";
import { runComviSetup } from "#build/comvi.setup";
import { watch } from "vue";
// The i18n instance is built by the BUILD-TIME template, never by a runtime
// branch here: a static `createI18n` import in this module would pin nuxt's
// default `@comvi/vue` construction path into every nuxt bundle, including apps
// that configured their own `hostModule`.
import { createComviI18n } from "#build/comvi.host";
import type { AnyVueI18n } from "@comvi/vue";
import type { TranslationValue } from "@comvi/core";
import { loadCatalogs } from "./utils/load-catalogs";
import { useHtmlAttrs } from "./utils/html-attrs";
import { hasLoaderApi } from "@comvi/core";
import { REQUEST_HOSTS_KEY, type RequestScopedHost } from "./request-hosts-key";
import {
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
} from "@comvi/core/editor-bridge";

/** Server hosts whose `addActiveNamespaces` already loads the fallback chain. */
const chainLoadingHosts = new WeakSet<object>();

const I18N_EDITOR_MAPPINGS_STATE_KEY = "__comvi_ice_mappings__";
const I18N_TRANSLATIONS_PAYLOAD_KEY = "__comvi_translations__";

type TranslationsPayload = Record<string, Record<string, TranslationValue>>;

/**
 * Keyed by "locale:namespace"; values must be plain (not null-prototype)
 * objects or JSON serialization drops them.
 */
function serializeTranslationCache(
  cacheMap: ReadonlyMap<string, Record<string, TranslationValue>>,
): TranslationsPayload {
  const result: TranslationsPayload = {};
  for (const [key, translations] of cacheMap) {
    result[key] = Object.fromEntries(Object.entries(translations));
  }
  return result;
}

export default defineNuxtPlugin({
  name: "@comvi/nuxt",
  enforce: "pre",

  async setup(nuxtApp) {
    const config = useRuntimeConfig();
    const publicConfig = config.public.comvi;

    const privateConfig = import.meta.server ? config.comvi : undefined;

    const localeState = useLocaleState(publicConfig.defaultLocale);

    // Registered before the first `await`, while the plugin still runs inside
    // the Nuxt app context `useHead` needs; the entry follows `localeState`.
    if (publicConfig.head !== false) {
      useHtmlAttrs(localeState, publicConfig.defaultLocale, publicConfig.localeObjects);
    }

    const cookieConfig = publicConfig.localeCookie;
    const localeCookie = cookieConfig
      ? useCookie(cookieConfig.name, {
          maxAge: cookieConfig.maxAge,
          path: "/",
          sameSite: cookieConfig.sameSite,
          domain: cookieConfig.domain,
          // Secure in production, disabled in dev so localhost HTTP works
          secure: import.meta.dev ? false : cookieConfig.secure,
        })
      : null;

    const baseI18nOptions = {
      locale: localeState.value,
      fallbackLocale: publicConfig.fallbackLocale,
      defaultNs: publicConfig.defaultNs,
      // `||` for the same `""` runtime config makes of an unset option.
      ns: publicConfig.ns || undefined,
      devMode: import.meta.dev,
      apiKey: privateConfig?.apiKey,
      // Without a `hostModule` the generated host is core's BASE host and has
      // no loader, so `comvi.translation` is the only catalog it ever gets.
      // `||`, not the value as-is: runtime config turns an unset option into
      // `""` (a `NUXT_PUBLIC_COMVI_TRANSLATION=` override does too), and core
      // rejects a string catalog. `defaultParams` and `basicHtmlTags` below are
      // truthy-checked for the same reason.
      translation: publicConfig.translation || undefined,
      tagInterpolation: publicConfig.basicHtmlTags
        ? { basicHtmlTags: publicConfig.basicHtmlTags }
        : undefined,
      ssrLocale: localeState.value,
    };
    const i18n = publicConfig.defaultParams
      ? createComviI18n({ ...baseI18nOptions, defaultParams: publicConfig.defaultParams })
      : createComviI18n(baseI18nOptions);

    const initialInContextEditorMappings = toRecordOfNumbers(
      nuxtApp.payload?.state?.[I18N_EDITOR_MAPPINGS_STATE_KEY],
    );

    if (import.meta.server) {
      // This host is per-request on the server, and until now nothing destroyed
      // it: `destroy()` ran only from the HMR dispose below, so a plugin
      // installed on the SSR host never cleaned up. Park it where the Nitro
      // server plugin's teardown looks, so the request's app host and the
      // server utilities' hosts go together, after the response.
      const requestEvent = nuxtApp.ssrContext?.event;
      if (requestEvent) {
        const context = requestEvent.context as Record<string, unknown>;
        const parked = context[REQUEST_HOSTS_KEY];
        if (Array.isArray(parked)) {
          (parked as RequestScopedHost[]).push(i18n);
        } else {
          context[REQUEST_HOSTS_KEY] = [i18n] satisfies RequestScopedHost[];
        }
      }

      nuxtApp.hook("app:rendered", () => {
        const mappings = readEditorMappings(i18n)?.getKeyMappings();
        if (mappings) {
          if (!nuxtApp.payload.state) {
            nuxtApp.payload.state = {};
          }
          nuxtApp.payload.state[I18N_EDITOR_MAPPINGS_STATE_KEY] = mappings;
        }

        const cacheMap = i18n.translationCache.value;
        if (cacheMap.size > 0) {
          nuxtApp.payload[I18N_TRANSLATIONS_PAYLOAD_KEY] = serializeTranslationCache(cacheMap);
        }
      });
    }

    if (!import.meta.server) {
      if (initialInContextEditorMappings) {
        (i18n as unknown as Record<string, unknown>)[EDITOR_INITIAL_MAPPINGS_GLOBAL] =
          initialInContextEditorMappings;
      }

      const ssrTranslations = nuxtApp.payload?.[I18N_TRANSLATIONS_PAYLOAD_KEY] as
        | TranslationsPayload
        | undefined;
      if (ssrTranslations) {
        i18n.addTranslations(ssrTranslations);
      }
    }

    try {
      await runComviSetup({
        i18n,
        core: i18n.core,
        nuxtApp,
        runtime: import.meta.server ? "server" : "client",
        runtimeConfig: config,
      });
    } catch (error) {
      i18n.reportError(error instanceof Error ? error : new Error(String(error)), {
        source: "plugin",
      });
      console.error("[@comvi/nuxt] comvi.setup hook failed:", error);
      // Fail fast: a failed setup can leave the app partially configured
      // (missing loaders/hooks). Rethrow so init() does not run on a broken state.
      throw error;
    }

    // Only after every plugin is registered.
    await i18n.init();

    if (import.meta.server) {
      const core = i18n.core;
      // `init()` and the middleware's locale switch load the active namespaces
      // for one locale each, never the fallback chain. The chain does not
      // depend on the request locale, so it is loaded once here, before the
      // render, and reaches the client through the payload with the rest.
      await loadCatalogs(core);
      // A namespace a page activates DURING the render (`useI18nLoader()
      // .addActiveNamespace(ns)`) loads for the current locale only. The render
      // waits for what a component awaits, not for anything collected before
      // `app:rendered` (by then the HTML already holds the raw key), so the
      // activation itself resolves only once the chain is in. This host is the
      // request's own, so the override never leaves the request; a `hostModule`
      // factory that returns one shared host anyway gets it wrapped once, not
      // once per request. One path still bypasses it: an `addActiveNamespaces`
      // reference taken inside `comvi.setup`, which runs before this line, and
      // called later. A `useI18nLoader()` bag acquired there is the same case.
      if (hasLoaderApi(core) && !chainLoadingHosts.has(core)) {
        chainLoadingHosts.add(core);
        const activate = core.addActiveNamespaces.bind(core);
        core.addActiveNamespaces = async (namespaces: string[]) => {
          await Promise.all([activate(namespaces), loadCatalogs(core, namespaces)]);
        };
      }
    }

    const unsubLocaleChanged = i18n.on("localeChanged", ({ to }) => {
      localeState.value = to;
      if (localeCookie) {
        localeCookie.value = to;
      }
    });

    // The middleware writes localeState; mirror it onto the instance.
    const unwatchLocale = watch(
      localeState,
      async (newLocale) => {
        if (newLocale && newLocale !== i18n.locale.value) {
          await i18n.setLocale(newLocale);
        }
      },
      { immediate: false },
    );

    // Cleanup on HMR to prevent memory leaks during hot reload
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubLocaleChanged();
        unwatchLocale();
        // `dispose` is synchronous and HMR does not wait: fire-and-forget is
        // the contract here, and `destroy()` resolves even when the host's
        // cleanup fails, so nothing can reach this as an unhandled rejection.
        void i18n.destroy();
      });
    }

    nuxtApp.vueApp.use(i18n);

    return {
      provide: {
        i18n,
      },
    };
  },
});

// `$i18n` is an ambient channel — a component cannot know how the app composed
// its host — so the core is seen capability-free there; capabilities come from
// `useI18nLoader()` / `useI18nPlugins()`, which verify them.
declare module "#app" {
  interface NuxtApp {
    $i18n: AnyVueI18n;
  }
}
