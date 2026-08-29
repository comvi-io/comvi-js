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

    const useCookieForLocale =
      publicConfig.detectBrowserLanguage !== false &&
      (typeof publicConfig.detectBrowserLanguage !== "object" ||
        publicConfig.detectBrowserLanguage.useCookie !== false);

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

    const baseI18nOptions = {
      locale: localeState.value,
      fallbackLocale: publicConfig.fallbackLocale,
      defaultNs: publicConfig.defaultNs,
      devMode: import.meta.dev,
      apiKey: privateConfig?.apiKey,
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
        i18n.destroy();
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
