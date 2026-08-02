import type { H3Event } from "h3";
import type { DefaultTranslationParams, I18n, I18nLoaderApi, WrapperI18nHost } from "@comvi/core";
import type { VueI18n } from "@comvi/vue";

/**
 * Locale prefix mode for URL routing
 */
export type LocalePrefixMode = "always" | "as-needed" | "never";

/**
 * Locale object with metadata
 */
export interface LocaleObject {
  /** Locale code (e.g., "en", "de") */
  code: string;
  /** Display name (e.g., "English", "Deutsch") */
  name?: string;
  /** Language direction */
  dir?: "ltr" | "rtl";
  /** ISO code for SEO (e.g., "en-US") */
  iso?: string;
}

/**
 * Browser language detection options
 */
export interface DetectBrowserLanguageOptions {
  /**
   * Use cookie to persist language preference
   * @default true
   */
  useCookie?: boolean;

  /**
   * Cookie name
   * @default "i18n_locale"
   */
  cookieName?: string;

  /**
   * Cookie max age in seconds
   * @default 31536000 (1 year)
   */
  cookieMaxAge?: number;

  /**
   * Set the Secure flag on the locale cookie.
   * When true, the cookie is only sent over HTTPS.
   * Automatically disabled in dev mode (import.meta.dev) regardless of this setting.
   * @default true
   */
  cookieSecure?: boolean;

  /**
   * SameSite attribute for the locale cookie.
   * @default "lax"
   */
  sameSite?: "lax" | "strict" | "none";

  /**
   * Domain for the locale cookie.
   * When set, the cookie is sent to the specified domain and its subdomains.
   */
  domain?: string;

  /**
   * Query parameter to read an explicit locale from (e.g. "lang" for ?lang=de).
   * Checked after the URL path prefix and before the cookie, on both server and
   * client navigation. Values outside `locales` are ignored. Disabled when unset.
   * @example "lang"
   */
  queryParam?: string;

  /**
   * Redirect to detected language on first visit
   * @default true
   */
  redirectOnFirstVisit?: boolean;

  /**
   * Fallback locale when detection fails
   * Uses defaultLocale if not specified
   */
  fallbackLocale?: string;
}

/**
 * Nuxt i18n module options
 */
export interface NuxtI18nOptions {
  // ============================================
  // Routing config (required)
  // ============================================

  /**
   * List of supported locales
   * Can be string codes or LocaleObject for additional metadata
   * @example ['en', 'de', 'uk', 'fr']
   * @example [{ code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' }]
   */
  locales: (string | LocaleObject)[];

  /**
   * Default locale (used when no locale is detected)
   * @example 'en'
   */
  defaultLocale: string;

  /**
   * Locale prefix mode for URLs
   * - 'always': Always include locale in URL (/en/about, /de/about)
   * - 'as-needed': Only include for non-default locales (/about, /de/about)
   * - 'never': Never include locale in URL (use cookies/headers)
   * @default 'as-needed'
   */
  localePrefix?: LocalePrefixMode;

  // ============================================
  // FetchLoader config
  // ============================================

  /**
   * Full CDN URL for production mode
   * @example "https://cdn.comvi.io/your-distribution-id"
   */
  cdnUrl?: string;

  /**
   * API key for authentication (required for dev mode API loading)
   * Should be set via runtimeConfig for security
   * @example process.env.NUXT_COMVI_API_KEY
   */
  apiKey?: string;

  /**
   * API base URL
   * @example 'https://api.comvi.io'
   */
  apiBaseUrl?: string;

  // ============================================
  // i18n config
  // ============================================

  /**
   * Default namespace for translations
   * @default 'default'
   */
  defaultNs?: string;

  /**
   * Fallback locale when translation is missing
   * @default same as defaultLocale
   */
  fallbackLocale?: string | string[];

  /**
   * @deprecated Use `fallbackLocale` instead. Will be removed in a future minor release.
   */
  fallbackLanguage?: string | string[];

  /**
   * JSON-serializable interpolation defaults forwarded to client and request-scoped instances.
   * Call controls (`locale`, `ns`, `fallback`, `raw`) must remain explicit per call.
   */
  defaultParams?: NuxtDefaultTranslationParams;

  /**
   * Path to a setup file that runs before i18n.init().
   * Use it to register plugins via i18n.core.use(...) — `i18n` is a `VueI18n`,
   * which dropped its capability proxies in 0.5.0.
   * If omitted, module auto-detects ./comvi.setup.* in project root.
   *
   * @example "./comvi.setup.ts"
   */
  setup?: string;

  /**
   * Path to a module whose DEFAULT export is a host factory —
   * `() => WrapperI18nHost` — used INSTEAD of the root `@comvi/core` entry.
   *
   * This is the composed-host recipe: build the host yourself out of
   * `@comvi/core/slim` plus only the capabilities you use, and nuxt wires it
   * through `@comvi/vue`'s `createI18nFromCore` on the client and uses it
   * directly in the server utilities. Unset (the default) keeps the root
   * entry and needs no app change.
   *
   * It is a module PATH, not a function: module options are serialized into
   * build-time template codegen, and the branch that decides whether the root
   * entry is imported at all has to be taken there — a runtime `if` would pin
   * the root entry into every bundle and save nothing.
   *
   * The factory is called once per constructed instance (the client plugin,
   * and each per-request server instance), so it must return a FRESH host
   * every call. The server always loads translations, so a server-rendered
   * app's host needs `attachLoader`.
   *
   * @example "./comvi.host.ts"
   * @example
   * ```ts
   * // comvi.host.ts
   * import { createI18n } from "@comvi/core/slim";
   * import { attachLoader } from "@comvi/core/loader";
   *
   * export default () => attachLoader(createI18n({ locale: "en" }));
   * ```
   */
  hostModule?: string;

  /**
   * Browser language detection options
   * Set to false to disable
   * @default { useCookie: true, cookieName: 'i18n_locale' }
   */
  detectBrowserLanguage?: DetectBrowserLanguageOptions | false;

  /**
   * HTML tags allowed in translations (for tag interpolation)
   * @example ['strong', 'em', 'br', 'a']
   */
  basicHtmlTags?: string[];
}

export type NuxtDefaultTranslationParams = Record<string, string | number | boolean> & {
  locale?: never;
  ns?: never;
  fallback?: never;
  raw?: never;
};

/**
 * Resolved routing configuration
 */
export interface ResolvedRoutingConfig {
  /** Normalized locale codes */
  locales: readonly string[];
  /** Locale metadata by code */
  localeObjects: Record<string, LocaleObject>;
  /** Default locale code */
  defaultLocale: string;
  /** Locale prefix mode */
  localePrefix: LocalePrefixMode;
  /** Cookie name for locale storage */
  cookieName: string;
}

/**
 * Runtime config for Nuxt
 */
export interface NuxtI18nRuntimeConfig {
  comvi: {
    locales: string[];
    localeObjects: Record<string, LocaleObject>;
    defaultLocale: string;
    localePrefix: LocalePrefixMode;
    cookieName: string;
    cdnUrl?: string;
    apiBaseUrl?: string;
    defaultNs: string;
    fallbackLocale: string | string[];
    defaultParams?: NuxtDefaultTranslationParams;
    basicHtmlTags?: string[];
    detectBrowserLanguage: DetectBrowserLanguageOptions | false;
  };
}

/**
 * Private runtime config (server-only)
 */
export interface NuxtI18nPrivateRuntimeConfig {
  comvi: {
    apiKey?: string;
  };
}

/**
 * Lightweight shape of Nuxt app instance used in setup context.
 */
export interface NuxtI18nSetupNuxtApp {
  vueApp?: {
    use: (plugin: unknown) => unknown;
  };
}

/**
 * Lightweight shape of runtime config used in setup context.
 */
export interface NuxtI18nSetupRuntimeConfig {
  public?: {
    comvi?: NuxtI18nRuntimeConfig["comvi"];
  };
  comvi?: NuxtI18nPrivateRuntimeConfig["comvi"];
}

/**
 * Lightweight shape of H3 event used in setup context.
 */
export interface NuxtI18nSetupEvent extends H3Event {
  context: H3Event["context"] & {
    runtimeConfig?: NuxtI18nSetupRuntimeConfig;
  };
}

/**
 * The host shape nuxt's SERVER utilities require: the wrapper surface plus
 * the loader capability. SSR always loads translations
 * (`loadTranslations`/`useTranslation` drive `reloadTranslations` and
 * `addActiveNamespace`), so a `hostModule` used by a server-rendered app must
 * compose `attachLoader`. ICU and tag syntax enter the server graph only if
 * the app composes them.
 */
export type NuxtServerHost<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D> &
  I18nLoaderApi;

/**
 * Context passed to `comvi.setup` hook.
 *
 * `C` is the host the app runs on. It defaults to the root `I18n` — the
 * default, root-entry configuration — so nothing changes for an app that does
 * not set `hostModule`. An app that DOES set it declares its own host type
 * (`NuxtI18nSetup<MyHost>`) and gets exactly the capabilities it composed;
 * capability calls move to `i18n.core.*` on the plugin side (framework-slim §3).
 */
export interface NuxtI18nSetupContext<C extends WrapperI18nHost = I18n> {
  /**
   * i18n instance for current runtime.
   * - VueI18n in Nuxt app plugin — capability APIs live on `i18n.core`
   * - The core host itself in server utilities (e.g. useTranslation)
   */
  i18n: VueI18n<{}, C> | C;

  /**
   * Runtime where setup is executed.
   */
  runtime: "client" | "server";

  /**
   * Nuxt app instance (available in runtime plugin).
   */
  nuxtApp?: NuxtI18nSetupNuxtApp;

  /**
   * H3 event (available in server utilities).
   */
  event?: NuxtI18nSetupEvent;

  /**
   * Nuxt runtime config (public + private) for setup decisions.
   */
  runtimeConfig?: NuxtI18nSetupRuntimeConfig;
}

/**
 * Signature for `comvi.setup` default export.
 *
 * @example
 * ```ts
 * // comvi.setup.ts — default (root) host
 * export default (({ i18n }) => {
 *   i18n.core.registerLoader(myLoader);
 * }) satisfies NuxtI18nSetup;
 * ```
 */
export type NuxtI18nSetup<C extends WrapperI18nHost = I18n> = (
  context: NuxtI18nSetupContext<C>,
) => void | Promise<void>;

// Module augmentation for Nuxt
declare module "@nuxt/schema" {
  interface NuxtConfig {
    comvi?: NuxtI18nOptions;
  }
  interface NuxtOptions {
    comvi?: NuxtI18nOptions;
  }
  interface PublicRuntimeConfig {
    comvi: NuxtI18nRuntimeConfig["comvi"];
  }
  interface RuntimeConfig {
    comvi: NuxtI18nPrivateRuntimeConfig["comvi"];
  }
}

// Re-export types from core for convenience
export type { TranslationParams, TranslationResult, TranslationKeys, I18n } from "@comvi/core";
