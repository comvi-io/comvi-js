import type { H3Event } from "h3";
import type { I18nOptions } from "@comvi/core";

export type LocalePrefixMode = "always" | "as-needed" | "never";

export interface LocaleObject {
  /** Locale code (e.g., "en", "de") */
  code: string;
  /** Display name (e.g., "English", "Deutsch") */
  name?: string;
  /** Language direction; default: the direction of the locale on screen */
  dir?: "ltr" | "rtl";
  /** ISO code for SEO (e.g., "en-US") */
  iso?: string;
}

// The routing options are ONE schema, shared with `@comvi/next` through the
// vendored locale-routing source: same names, same shapes, same defaults except
// the cookie name. Type-only, 0 B.
export type {
  LocaleCookieConfig,
  LocaleCookieOptions,
  LocaleDetectionConfig,
  LocaleDetectionSource,
  ResolveAcceptLanguage,
  ResolvedLocaleCookie,
} from "./runtime/_vendor/locale-routing";
import type {
  LocaleCookieConfig,
  LocaleDetectionConfig,
  ResolvedLocaleDetection as SharedResolvedLocaleDetection,
  ResolvedLocaleCookie,
} from "./runtime/_vendor/locale-routing";

/**
 * `comvi` in `nuxt.config`: data only, written once. The functions (loader, `onError`,
 * `missing`, plugins) live in `comvi.i18n.ts` ({@link I18nOptionsFactory}).
 */
export interface NuxtI18nOptions {
  /**
   * Supported locales: codes, or {@link LocaleObject}s with metadata.
   * @example ['en', 'de', 'uk']
   */
  locales: (string | LocaleObject)[];

  /**
   * The locale of a URL or request that names no supported one.
   * @default 'en'
   */
  defaultLocale: string;

  /**
   * - 'always': every URL carries the locale (`/en/about`, `/de/about`)
   * - 'as-needed': all but the default locale's (`/about`, `/de/about`)
   * - 'never': no URL does; the cookie, then `localeDetection`, decides
   * @default 'as-needed'
   */
  localePrefix?: LocalePrefixMode;

  /**
   * Write `<html lang dir>` from the locale on screen, on the server render and on every
   * switch. `lang` is the locale's `iso` (or its code), `dir` its declared `dir` (or the
   * locale's direction). Set `false` to own these attributes yourself.
   * @default true
   */
  head?: boolean;

  /** The locale cookie: a name, its options, or `false` to persist nothing. */
  localeCookie?: LocaleCookieConfig;

  /** Where a URL that names no locale reads it from, or `false` for none. */
  localeDetection?: LocaleDetectionConfig | false;

  /**
   * The time zone both the server and the browser format dates in. Required: a server
   * and a browser in different zones render the same date differently.
   * @example 'UTC'
   */
  timeZone: string;

  /**
   * Fallback locale(s) of a missing translation, core's `fallbackLocale`. Applies only
   * when set.
   */
  fallbackLocale?: I18nOptions["fallbackLocale"];

  /** Namespaces loaded at start besides `default`, core's `namespaces`. */
  namespaces?: readonly string[];

  /** Named number and date formats, core's `formats`. */
  formats?: I18nOptions["formats"];

  /**
   * Inline catalogs of the `default` namespace by locale, nested or flat (core's
   * `messages`). They are compiled into the app bundle; files and a loader in
   * `comvi.i18n.ts` are the scalable path.
   * @example { en: { greeting: "Hello" }, de: { greeting: "Hallo" } }
   */
  messages?: I18nOptions["messages"];

  /**
   * The options file, default-exporting `defineI18nOptions((event) => options)`. Unset: the
   * module looks for `./comvi.i18n.*` under `srcDir`, then `rootDir`.
   * @example './comvi.i18n.ts'
   */
  i18nModule?: string;
}

/**
 * What `comvi.i18n.ts` gives the instance: its functions. Data (locales, catalogs,
 * formats, the time zone) are `comvi` options in `nuxt.config`.
 */
export type NuxtI18nFileOptions = Pick<I18nOptions, "loader" | "onError" | "missing" | "plugins">;

/**
 * The default export of `comvi.i18n.ts`. Called once per instance: with the request's H3
 * event on a server (the page render, `useTranslation(event)`), with `undefined` in the
 * browser. The file is bundled for the browser, the Vue server build and Nitro, so it
 * uses no Nuxt app composable: what it needs of the request it takes from `event`
 * (`event?.$fetch ?? $fetch` forwards the user's cookies).
 */
export type I18nOptionsFactory = (event: H3Event | undefined) => NuxtI18nFileOptions;

/**
 * `localeDetection` as the module writes it into runtime config: the shared
 * normalized shape without `resolveAcceptLanguage`, which travels as source in
 * `#build/comvi.detection` instead.
 */
export type ResolvedLocaleDetection = Omit<SharedResolvedLocaleDetection, "resolveAcceptLanguage">;

/** `runtimeConfig.public.comvi`: the routing contract, read by the module's runtime. */
export interface NuxtI18nRuntimeConfig {
  comvi: {
    locales: string[];
    localeObjects: Record<string, LocaleObject>;
    defaultLocale: string;
    localePrefix: LocalePrefixMode;
    head?: boolean;
    localeCookie: ResolvedLocaleCookie | false;
    localeDetection: ResolvedLocaleDetection | false;
  };
}

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
}
