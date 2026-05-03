import type { H3Event } from "h3";

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
   * Fallback language when translation is missing
   * @default same as defaultLocale
   */
  fallbackLanguage?: string | string[];

  /**
   * Path to a setup file that runs before i18n.init().
   * Use it to register plugins via i18n.use(...).
   * If omitted, module auto-detects ./comvi.setup.* in project root.
   *
   * @example "./comvi.setup.ts"
   */
  setup?: string;

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
    fallbackLanguage: string | string[];
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
 * Context passed to `comvi.setup` hook.
 */
export interface NuxtI18nSetupContext {
  /**
   * i18n instance for current runtime.
   * - VueI18n in Nuxt app plugin
   * - Core I18n in server utilities (e.g. useTranslation)
   */
  i18n: import("@comvi/vue").VueI18n | import("@comvi/core").I18n;

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
 */
export type NuxtI18nSetup = (context: NuxtI18nSetupContext) => void | Promise<void>;

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
