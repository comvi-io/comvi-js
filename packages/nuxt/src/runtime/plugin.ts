import { defineNuxtPlugin, useRuntimeConfig, useCookie } from "#app";
import { useLocaleState } from "./utils/locale-state";
import { runComviSetup } from "#build/comvi.setup";
import { watch } from "vue";
// The i18n instance is built by the BUILD-TIME template, never by a runtime
// branch here: a static `createI18n` import in this module would pin nuxt's
// default `@comvi/vue` construction path (and the base `@comvi/core` root it
// builds on) into every nuxt bundle, including apps that configured their own
// `hostModule` (framework-slim P4 step 5).
import { createComviI18n } from "#build/comvi.host";
import type { AnyVueI18n } from "@comvi/vue";
import type { TranslationValue } from "@comvi/core";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "./defaults";
import {
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
} from "@comvi/core/editor-bridge";

const I18N_EDITOR_MAPPINGS_STATE_KEY = "__comvi_ice_mappings__";
const I18N_TRANSLATIONS_PAYLOAD_KEY = "__comvi_translations__";

type TranslationsPayload = Record<string, Record<string, TranslationValue>>;

/**
 * Serialize the translation cache Map to a plain object for Nuxt payload.
 * Each entry is keyed by "locale:namespace" and the value is a plain object
 * (not null-prototype) so JSON serialization works.
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

/**
 * Nuxt plugin that initializes the i18n instance
 *
 * This plugin:
 * 1. Creates the i18n instance using @comvi/vue
 * 2. Runs optional comvi.setup hook (plugin registration)
 * 3. Hydrates translations from SSR payload (avoids double-fetch)
 * 4. Syncs locale with Nuxt state and cookie
 * 5. Provides the i18n instance to components
 */
export default defineNuxtPlugin({
  name: "@comvi/nuxt",
  enforce: "pre",

  async setup(nuxtApp) {
    const config = useRuntimeConfig();
    const publicConfig = config.public.comvi;

    // Get private config (server-only)
    const privateConfig = import.meta.server ? config.comvi : undefined;

    // Initialize locale state (SSR-safe)
    const localeState = useLocaleState(publicConfig.defaultLocale);

    const useCookieForLocale =
      publicConfig.detectBrowserLanguage !== false &&
      (typeof publicConfig.detectBrowserLanguage !== "object" ||
        publicConfig.detectBrowserLanguage.useCookie !== false);

    // Cookie for locale persistence
    const detectCfg =
      typeof publicConfig.detectBrowserLanguage === "object"
        ? publicConfig.detectBrowserLanguage
        : undefined;
    const cookieSecure = detectCfg?.cookieSecure ?? true;

    const localeCookie = useCookieForLocale
      ? useCookie(publicConfig.cookieName, {
          maxAge: detectCfg?.cookieMaxAge ?? DEFAULT_DETECT_BROWSER_LANGUAGE.cookieMaxAge,
          path: "/",
          sameSite: detectCfg?.sameSite ?? "lax",
          domain: detectCfg?.domain,
          // Secure in production, disabled in dev so localhost HTTP works
          secure: import.meta.dev ? false : cookieSecure,
        })
      : null;

    // Create i18n instance
    const baseI18nOptions = {
      locale: localeState.value,
      fallbackLocale: publicConfig.fallbackLocale,
      defaultNs: publicConfig.defaultNs,
      devMode: import.meta.dev,
      apiKey: privateConfig?.apiKey,
      tagInterpolation: publicConfig.basicHtmlTags
        ? { basicHtmlTags: publicConfig.basicHtmlTags }
        : undefined,
      // Pass initial locale for SSR hydration
      ssrLocale: localeState.value,
    };
    const i18n = publicConfig.defaultParams
      ? createComviI18n({ ...baseI18nOptions, defaultParams: publicConfig.defaultParams })
      : createComviI18n(baseI18nOptions);

    const initialInContextEditorMappings = toRecordOfNumbers(
      nuxtApp.payload?.state?.[I18N_EDITOR_MAPPINGS_STATE_KEY],
    );

    // --- SSR: save translations to payload after rendering ---
    if (import.meta.server) {
      nuxtApp.hook("app:rendered", () => {
        // Save in-context editor mappings
        const mappings = readEditorMappings(i18n)?.getKeyMappings();
        if (mappings) {
          if (!nuxtApp.payload.state) {
            nuxtApp.payload.state = {};
          }
          nuxtApp.payload.state[I18N_EDITOR_MAPPINGS_STATE_KEY] = mappings;
        }

        // Save loaded translations to payload for client hydration
        const cacheMap = i18n.translationCache.value;
        if (cacheMap.size > 0) {
          nuxtApp.payload[I18N_TRANSLATIONS_PAYLOAD_KEY] = serializeTranslationCache(cacheMap);
        }
      });
    }

    // --- Client: hydrate translations from SSR payload before init ---
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

    // Initialize i18n (only once, after all plugins are registered)
    // init() reports errors before rethrowing
    await i18n.init();

    // Sync locale changes to cookie
    const unsubLocaleChanged = i18n.on("localeChanged", ({ to }) => {
      localeState.value = to;
      if (localeCookie) {
        localeCookie.value = to;
      }
    });

    // Watch for locale state changes (from middleware) and sync to i18n
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
        i18n.destroy();
      });
    }

    // Install Vue plugin
    nuxtApp.vueApp.use(i18n);

    return {
      provide: {
        i18n,
      },
    };
  },
});

// Type augmentation for useNuxtApp. `$i18n` is an ambient channel — a
// component cannot know how the app composed its host — so the core is seen
// capability-free there; capabilities come from `useI18nLoader()` /
// `useI18nPlugins()`, which verify them (framework-slim §3.2).
declare module "#app" {
  interface NuxtApp {
    $i18n: AnyVueI18n;
  }
}
