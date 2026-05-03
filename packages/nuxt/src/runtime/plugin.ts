import { defineNuxtPlugin, useRuntimeConfig, useState, useCookie } from "#app";
import { runComviSetup } from "#build/comvi.setup";
import { watch } from "vue";
import { createI18n } from "@comvi/vue";
import type { VueI18n } from "@comvi/vue";
import type { TranslationValue } from "@comvi/core";

const I18N_EDITOR_MAPPINGS_STATE_KEY = "__comvi_ice_mappings__";
const I18N_EDITOR_MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";
const I18N_EDITOR_INITIAL_MAPPINGS_KEY = "__comviInContextEditorInitialMappings";
const I18N_TRANSLATIONS_PAYLOAD_KEY = "__comvi_translations__";

type InContextEditorMappingsBridge = {
  getKeyMappings?: () => Record<string, number>;
  loadKeyMappings?: (mappings: Record<string, number>) => void;
};

type TranslationsPayload = Record<string, Record<string, TranslationValue>>;

function getInContextEditorBridge(i18n: VueI18n): InContextEditorMappingsBridge | undefined {
  const bridge = (i18n as unknown as Record<string, unknown>)[I18N_EDITOR_MAPPINGS_BRIDGE_KEY];
  if (!bridge || typeof bridge !== "object") {
    return undefined;
  }
  return bridge as InContextEditorMappingsBridge;
}

function toRecordOfNumbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, number> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return undefined;
    }
    result[key] = item;
  }
  return result;
}

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
    const localeState = useState<string>("i18n-locale", () => publicConfig.defaultLocale);

    const useCookieForLocale =
      publicConfig.detectBrowserLanguage !== false &&
      (typeof publicConfig.detectBrowserLanguage !== "object" ||
        publicConfig.detectBrowserLanguage.useCookie !== false);

    // Cookie for locale persistence
    const cookieSecure =
      typeof publicConfig.detectBrowserLanguage === "object" &&
      publicConfig.detectBrowserLanguage.cookieSecure !== undefined
        ? publicConfig.detectBrowserLanguage.cookieSecure
        : true; // Secure by default

    const localeCookie = useCookieForLocale
      ? useCookie(publicConfig.cookieName, {
          maxAge:
            typeof publicConfig.detectBrowserLanguage === "object"
              ? publicConfig.detectBrowserLanguage.cookieMaxAge
              : 365 * 24 * 60 * 60,
          path: "/",
          sameSite: "lax",
          // Secure in production, disabled in dev so localhost HTTP works
          secure: import.meta.dev ? false : cookieSecure,
        })
      : null;

    // Create i18n instance
    const i18n = createI18n({
      locale: localeState.value,
      fallbackLocale: publicConfig.fallbackLanguage,
      defaultNs: publicConfig.defaultNs,
      devMode: import.meta.dev,
      apiKey: privateConfig?.apiKey,
      tagInterpolation: publicConfig.basicHtmlTags
        ? { basicHtmlTags: publicConfig.basicHtmlTags }
        : undefined,
      // Pass initial locale for SSR hydration
      ssrLanguage: localeState.value,
    });

    const initialInContextEditorMappings = toRecordOfNumbers(
      nuxtApp.payload?.state?.[I18N_EDITOR_MAPPINGS_STATE_KEY],
    );

    // --- SSR: save translations to payload after rendering ---
    if (import.meta.server) {
      nuxtApp.hook("app:rendered", () => {
        // Save in-context editor mappings
        const mappings = getInContextEditorBridge(i18n)?.getKeyMappings?.();
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
        (i18n as unknown as Record<string, unknown>)[I18N_EDITOR_INITIAL_MAPPINGS_KEY] =
          initialInContextEditorMappings;
      }

      const ssrTranslations = nuxtApp.payload?.[I18N_TRANSLATIONS_PAYLOAD_KEY] as
        | TranslationsPayload
        | undefined;
      if (ssrTranslations) {
        i18n.addTranslations(ssrTranslations);
      }
    }

    await runComviSetup({
      i18n,
      nuxtApp,
      runtime: import.meta.server ? "server" : "client",
      runtimeConfig: config,
    });

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

// Type augmentation for useNuxtApp
declare module "#app" {
  interface NuxtApp {
    $i18n: VueI18n;
  }
}
