import type { H3Event } from "h3";
import type { DefaultTranslationParams, I18n, I18nLoaderApi, WrapperI18nHost } from "@comvi/core";
import type { VueI18n } from "@comvi/vue";

export type LocalePrefixMode = "always" | "as-needed" | "never";

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

export interface NuxtI18nOptions {
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
   * whose capability APIs live on `i18n.core`.
   * If omitted, module auto-detects ./comvi.setup.* in project root.
   *
   * @example "./comvi.setup.ts"
   */
  setup?: string;

  /**
   * Opt the module's OWN generated host into the ICU compiler, so
   * `{count, plural, one {# item} other {# items}}` renders instead of throwing
   * `E_ICU_SYNTAX`.
   *
   * The choice is made at BUILD time, in codegen: left `false` the generated
   * module contains no `@comvi/core/icu` import at all, so the option costs
   * nothing when off. A runtime `if` would pin the compiler into every bundle.
   *
   * `hostModule` wins: when it is set this option is ignored with a build-time
   * warning, because a composed host already decides its own compiler. ICU is
   * the only capability with a module option — the loader, the plugin host and
   * devtools discovery still require `hostModule`.
   *
   * @default false
   */
  icu?: boolean;

  /**
   * Path to a module whose DEFAULT export is a {@link NuxtHostFactory} —
   * `(options) => WrapperI18nHost` — used INSTEAD of `@comvi/vue`'s own
   * constructor.
   *
   * This is how a nuxt app gets any capability at all. Unset (the default)
   * builds the BASE host, and the module will not inject ICU, the loader, the
   * plugin host or devtools on your behalf.
   *
   * It is a module PATH, not a function: the branch that decides whether
   * `@comvi/vue`'s constructor is imported at all is taken in build-time
   * codegen — a runtime `if` would pin it into every bundle and save nothing.
   *
   * The factory is called once per constructed instance (the client plugin, and
   * each per-request server instance), so it must return a FRESH host every
   * call. It receives nuxt's RESOLVED core options, so a composed host honours
   * the same `nuxt.config` the default branch does. SSR always loads
   * translations, so a server-rendered app composes the loader here; without it
   * the server utilities say so once, by name, and render what the catalog
   * already holds.
   *
   * @example "./comvi.host.ts"
   * @example
   * ```ts
   * // comvi.host.ts — the full explicit composition
   * import { createI18n } from "@comvi/core";
   * import { icuCompiler } from "@comvi/core/icu";
   * import { loader } from "@comvi/core/loader";
   * import { plugins } from "@comvi/core/plugins";
   * import { devtools } from "@comvi/core/devtools";
   *
   * export default (options) =>
   *   createI18n({ ...options, compiler: icuCompiler })
   *     .with(loader({ uk: () => import("./locales/uk.json") }))
   *     .with(plugins())
   *     .with(devtools());
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

export interface ResolvedRoutingConfig {
  locales: readonly string[];
  /** Locale metadata by code */
  localeObjects: Record<string, LocaleObject>;
  defaultLocale: string;
  localePrefix: LocalePrefixMode;
  cookieName: string;
}

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
 * The host shape nuxt's SERVER utilities accept: the BASE host and nothing
 * more, because that is what the generated default `#build/comvi.host` builds.
 * The loader is NOT part of it — `loadTranslations` and `useTranslation` probe
 * for the capability with core's `hasLoaderApi` and say so once, by name, when
 * it is absent, rather than calling a member the host does not have.
 */
export type NuxtServerHost<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D>;

/**
 * A {@link NuxtServerHost} whose `hostModule` factory composed
 * `@comvi/core/loader`. This is the shape SSR translation loading actually
 * needs, and the one the server utilities narrow to before driving
 * `reloadTranslations` / `addActiveNamespace`.
 */
export type NuxtServerLoaderHost<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D> &
  I18nLoaderApi;

/**
 * The resolved options nuxt hands a `hostModule` factory: every core option
 * the module derived from `nuxt.config` and runtime config, so a composed
 * host honours the same configuration the default branch does.
 *
 * `locale` is already nuxt's resolved render locale (the client plugin's
 * hydration locale, or the per-request server locale), so a factory that
 * forwards it into `createI18n` is constructed correct rather than corrected
 * afterwards.
 */
export type NuxtHostFactoryOptions<D extends DefaultTranslationParams = {}> = {
  locale: string;
  fallbackLocale?: string | string[];
  defaultNs?: string;
  devMode?: boolean;
  apiKey?: string;
  tagInterpolation?: { basicHtmlTags?: string[] };
  /** Present on the client plugin's call only; equal to `locale`. */
  ssrLocale?: string;
} & (keyof D extends never ? {} : { defaultParams: D });

/**
 * The `hostModule` default export: a factory returning a FRESH host per call.
 *
 * `C` is the host the app composed, and it flows all the way through — a
 * factory typed `NuxtHostFactory<I18n & I18nLoaderApi>` is what makes
 * `NuxtI18nSetup<I18n & I18nLoaderApi>` the matching hook signature.
 */
export type NuxtHostFactory<C = WrapperI18nHost, D extends DefaultTranslationParams = {}> =
  C extends WrapperI18nHost<D> ? (options: NuxtHostFactoryOptions<D>) => C : never;

/**
 * Context passed to `comvi.setup` hook.
 *
 * `C` is the host the app runs on. It defaults to the base `I18n` that
 * `@comvi/vue`'s `createI18n` builds — the no-`hostModule` configuration. An
 * app that DOES set it declares its own host type (`NuxtI18nSetup<MyHost>`) and
 * gets exactly the capabilities it composed; capability calls live on
 * `i18n.core.*` on the plugin side.
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
 * Signature for a `comvi.setup` default export.
 *
 * The default type parameter is the BASE host, so capability calls do not
 * compile by accident. Give it the host shape the matching `hostModule`
 * factory composed:
 *
 * @example
 * ```ts
 * // comvi.setup.ts
 * import type { I18n, I18nLoaderApi } from "@comvi/core";
 *
 * export default (({ i18n }) => {
 *   i18n.core.registerLoader(myLoader);
 * }) satisfies NuxtI18nSetup<I18n & I18nLoaderApi>;
 * ```
 */
export type NuxtI18nSetup<C extends WrapperI18nHost = I18n> = (
  context: NuxtI18nSetupContext<C>,
) => void | Promise<void>;

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

export type { TranslationParams, TranslationResult, TranslationKeys, I18n } from "@comvi/core";
