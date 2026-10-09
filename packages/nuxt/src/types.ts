import type { H3Event } from "h3";
import type {
  DefaultTranslationParams,
  I18n,
  I18nLoaderApi,
  I18nOptions,
  MessageCompiler,
  WrapperI18nInstance,
} from "@comvi/core";
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
   * Write `<html lang dir>` from the active locale: on the server render, and
   * on every client locale switch in the same commit as the text. `lang` is
   * the locale's `iso` (or its code); `dir` is the locale's declared `dir`, or
   * the language's own direction. `useLocaleHead()` is still the place for
   * canonical, hreflang and `og:locale`; calling it as well is safe, both
   * write the same values. Set `false` to own `<html>` attributes yourself.
   * @default true
   */
  head?: boolean;

  /**
   * Credential forwarded to the instance as `i18n.apiKey`, for a loader plugin that
   * authenticates against a backend (`@comvi/plugin-fetch-loader` reads it
   * there). This module loads NOTHING on your behalf — it neither contacts a
   * CDN nor an API — so the key is inert until a `i18nModule` factory composes
   * a plugin that reads it.
   *
   * Set it through private `runtimeConfig` rather than in `nuxt.config`
   * literally: it is read from the server-only config, never serialized into
   * the client payload.
   *
   * @example process.env.NUXT_COMVI_API_KEY
   */
  apiKey?: string;

  /**
   * Inline catalogs, keyed `locale` or `"locale:namespace"` —
   * exactly `I18nOptions["messages"]`, forwarded verbatim into BOTH
   * constructed instances (the client plugin and each per-request server instance) and
   * into a `i18nModule` factory's resolved options.
   *
   * This is the whole reason a two-line `comvi` block can render a translation:
   * without a `i18nModule` the generated instance is core's BASE instance, which has no
   * loader, so a catalog declared here is the only catalog it will ever have.
   *
   * It travels through public `runtimeConfig`, so it must stay
   * JSON-serializable and must not hold anything private.
   *
   * @example { en: { greeting: "Hello" }, de: { greeting: "Hallo" } }
   */
  messages?: I18nOptions["messages"];

  /**
   * Default namespace for translations
   * @default 'default'
   */
  defaultNs?: string;

  /**
   * Namespaces to load at init besides `defaultNs` — core's `ns` option,
   * forwarded into both constructed instances and a `i18nModule` factory's options.
   * @example ["common", "nav"]
   */
  ns?: I18nOptions["ns"];

  /**
   * Fallback locale when translation is missing
   * @default same as defaultLocale
   */
  fallbackLocale?: string | string[];

  /**
   * JSON-serializable interpolation defaults forwarded to client and request-scoped instances.
   * Call controls (`locale`, `ns`, `fallback`, `raw`) must remain explicit per call.
   */
  defaultParams?: NuxtDefaultTranslationParams;

  /**
   * Path to a setup file that runs before i18n.init().
   *
   * Register your own plugin with `i18n.core.use(definePlugin(fn))` from
   * `@comvi/nuxt/i18n` — `i18n` is a `VueI18n`, whose capability APIs live on
   * `i18n.core`. That shape works on BOTH instances: `definePlugin` attaches the
   * plugin when it is absent, which it is on the module's generated DEFAULT
   * instance (core's base instance). `i18n.core.registerPlugin(...)` is the raw queue
   * and exists only when the instance was composed with the plugin capability — in
   * a `i18nModule` factory — so on the default instance it is `undefined` and
   * calling it throws a `TypeError`.
   *
   * If omitted, the module auto-detects `./comvi.setup.*` under `srcDir`, then
   * `rootDir`, and logs a near miss (a file it found but could not resolve).
   *
   * @example "./comvi.setup.ts"
   */
  setup?: string;

  /**
   * Opt the instance into the ICU compiler, so
   * `{count, plural, one {# item} other {# items}}` renders instead of throwing
   * `E_ICU_SYNTAX`.
   *
   * The choice is made at BUILD time, in codegen: left `false` the generated
   * module contains no `@comvi/core/icu` import at all, so the option costs
   * nothing when off. A runtime `if` would pin the compiler into every bundle.
   *
   * With no `i18nModule` it is the generated BASE instance that gets the compiler.
   * With one, `compiler: icuCompiler` is placed LAST in the resolved options
   * the factory receives, so a factory that spreads `options` gets ICU and one
   * that writes its own `compiler` after the spread wins by key order. ICU is
   * the only capability with a module option — the loader, the plugin capability and
   * devtools discovery are composed in the `i18nModule` factory.
   *
   * @default false
   */
  icu?: boolean;

  /**
   * Path to a module whose DEFAULT export is a {@link NuxtInstanceFactory} —
   * `(options) => WrapperI18nInstance` — used INSTEAD of `@comvi/vue`'s own
   * constructor.
   *
   * This is how a nuxt app gets any capability at all. Unset (the default),
   * the module auto-detects `./comvi.i18n.*` under `srcDir`, then `rootDir`,
   * and logs the path it picked so a stray file is visible at build time; when
   * there is none it builds the BASE instance, and will not inject the loader, the
   * plugin or devtools on your behalf (ICU is the one exception, through
   * `icu: true`). Set it to name the file explicitly — a set `i18nModule` that
   * does not resolve is a build error, never a silent fallback.
   *
   * It is a module PATH, not a function: the branch that decides whether
   * `@comvi/vue`'s constructor is imported at all is taken in build-time
   * codegen — a runtime `if` would pin it into every bundle and save nothing.
   *
   * The factory is called once per constructed instance (the client plugin, and
   * each per-request server instance), so it must return a FRESH instance every
   * call. It receives nuxt's RESOLVED core options, so a composed instance honours
   * the same `nuxt.config` the default branch does. SSR always loads
   * translations, so a server-rendered app composes the loader here; without it
   * the server utilities say so once, by name, and render what the catalog
   * already holds.
   *
   * @example "./comvi.i18n.ts"
   * @example
   * ```ts
   * // comvi.i18n.ts — the full explicit composition, in the one file that
   * // names comvi values: `@comvi/nuxt/i18n` re-exports core's installers so
   * // the recipe needs no dependency the app did not already install.
   * import { createI18n, icuCompiler, loader, plugins, devtools } from "@comvi/nuxt/i18n";
   *
   * export default (options) =>
   *   createI18n({ ...options, compiler: icuCompiler })
   *     .use(loader({ uk: () => import("./locales/uk.json") }))
   *     .use(plugins())
   *     .use(devtools());
   * ```
   */
  i18nModule?: string;

  /**
   * The locale cookie: a name, its attributes, or `false` to persist nothing.
   * The same option as `@comvi/next`'s; only the default name differs.
   * @default "i18n_locale"
   */
  localeCookie?: LocaleCookieConfig;

  /**
   * Where the locale comes from after the URL path. `false` turns detection
   * off: the path decides, otherwise `defaultLocale`. `header` and
   * `accept-language` are read on the server only. `resolveAcceptLanguage`
   * reaches the runtime as SOURCE — the module copies it into the build, since
   * runtime config carries JSON only — so it must be self-contained: no import
   * or variable from `nuxt.config`.
   * @default { order: ["query", "cookie", "accept-language"] }
   */
  localeDetection?: false | LocaleDetectionConfig;

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
  /** The locale cookie's name, or `false` when `localeCookie: false` persists nothing. */
  cookieName: string | false;
}

/**
 * `localeDetection` as the module writes it into runtime config: the shared
 * normalized shape without `resolveAcceptLanguage`, which travels as source in
 * `#build/comvi.detection` instead.
 */
export type ResolvedLocaleDetection = Omit<SharedResolvedLocaleDetection, "resolveAcceptLanguage">;

export interface NuxtI18nRuntimeConfig {
  comvi: {
    locales: string[];
    localeObjects: Record<string, LocaleObject>;
    defaultLocale: string;
    localePrefix: LocalePrefixMode;
    head?: boolean;
    messages?: I18nOptions["messages"];
    defaultNs: string;
    ns?: I18nOptions["ns"];
    fallbackLocale: string | string[];
    defaultParams?: NuxtDefaultTranslationParams;
    basicHtmlTags?: string[];
    localeCookie: ResolvedLocaleCookie | false;
    localeDetection: ResolvedLocaleDetection | false;
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
 * The instance shape nuxt's SERVER utilities accept: the BASE instance and nothing
 * more, because that is what the generated default `#build/comvi.i18n` builds.
 * The loader is NOT part of it — `loadMessages` and `useTranslation` probe
 * for the capability with core's `hasLoaderApi` and say so once, by name, when
 * it is absent, rather than calling a member the instance does not have.
 */
export type NuxtServerInstance<D extends DefaultTranslationParams = {}> = WrapperI18nInstance<D>;

/**
 * A {@link NuxtServerInstance} whose `i18nModule` factory composed
 * `@comvi/core/loader`. This is the shape SSR translation loading actually
 * needs, and the one the server utilities narrow to before driving
 * `reloadMessages` / `addActiveNamespace`.
 */
export type NuxtServerLoaderInstance<D extends DefaultTranslationParams = {}> =
  WrapperI18nInstance<D> & I18nLoaderApi;

/**
 * The resolved options nuxt hands a `i18nModule` factory: every core option
 * the module derived from `nuxt.config` and runtime config, so a composed
 * instance honours the same configuration the default branch does.
 *
 * `locale` is already nuxt's resolved render locale (the client plugin's
 * hydration locale, or the per-request server locale), so a factory that
 * forwards it into `createI18n` is constructed correct rather than corrected
 * afterwards.
 */
export type NuxtInstanceFactoryOptions<D extends DefaultTranslationParams = {}> = {
  locale: string;
  fallbackLocale?: string | string[];
  defaultNs?: string;
  /** `comvi.ns` verbatim: namespaces loaded at init besides `defaultNs`. */
  ns?: I18nOptions["ns"];
  devMode?: boolean;
  apiKey?: string;
  /** `comvi.messages` verbatim; a factory that spreads `options` keeps it. */
  messages?: I18nOptions["messages"];
  /**
   * `icuCompiler`, present only when `comvi.icu` is `true` — the last key in
   * the object, so `createI18n({ ...options })` compiles ICU and
   * `createI18n({ ...options, compiler: mine })` keeps yours.
   */
  compiler?: MessageCompiler;
  tagInterpolation?: { basicHtmlTags?: string[] };
  /** Present on the client plugin's call only; equal to `locale`. */
  ssrLocale?: string;
} & (keyof D extends never ? {} : { defaultParams: D });

/**
 * The `i18nModule` default export: a factory returning a FRESH instance per call.
 *
 * `C` is the instance the app composed, and it flows all the way through — a
 * factory typed `NuxtInstanceFactory<I18n & I18nLoaderApi>` is what makes
 * `NuxtI18nSetup<I18n & I18nLoaderApi>` the matching hook signature.
 */
export type NuxtInstanceFactory<C = WrapperI18nInstance, D extends DefaultTranslationParams = {}> =
  C extends WrapperI18nInstance<D> ? (options: NuxtInstanceFactoryOptions<D>) => C : never;

/**
 * The one slot the module's generated `#build` declaration writes the app's
 * REAL instance into, as `ReturnType<typeof import("./comvi.i18n").default>`.
 *
 * It exists because a `comvi.setup` hook's instance type used to be an unverified
 * ASSERTION about a different file reached by a string path: a hook typed
 * `NuxtI18nSetup<I18n & I18nLoaderApi>` compiled whether or not
 * `comvi.i18n.ts` ever composed the loader, and a base instance has no capability
 * shim, so `core.registerLoader(...)` threw a raw `TypeError` on the first
 * call. Codegen augments this interface, which makes {@link ResolvedNuxtInstance}
 * — and therefore `NuxtI18nSetup`'s DEFAULT type argument — the instance the
 * factory actually returns.
 *
 * An app never writes to it by hand. Empty here on purpose: this package
 * compiles without any app, and the fallbacks below are what that means.
 */
export interface ComviNuxtInstanceRegistry {}

/**
 * {@link ComviNuxtInstanceRegistry}'s `instance` when codegen wrote one, `Fallback`
 * otherwise — the seam the two audiences need different answers from.
 */
export type RegisteredNuxtInstance<Fallback extends WrapperI18nInstance> =
  ComviNuxtInstanceRegistry extends {
    instance: infer H;
  }
    ? H extends WrapperI18nInstance
      ? H
      : Fallback
    : Fallback;

/**
 * The instance this app runs on: the `comvi.i18n` factory's return type when the
 * module's generated declaration is in the program, core's base `I18n` (the
 * no-`i18nModule` branch, and this package's own compilation) otherwise.
 *
 * This is `NuxtI18nSetup`'s default type argument, so a hook written
 * `satisfies NuxtI18nSetup` — no type argument at all — is typed from the
 * factory rather than from a claim about it.
 */
export type ResolvedNuxtInstance = RegisteredNuxtInstance<I18n>;

/**
 * The cross-check the module's generated `#build` declaration applies to
 * `comvi.setup`'s default export: `Hook` is returned unchanged when it matches
 * `Instance`, and is a COMPILE error when it asks for a capability `Instance` does not
 * have.
 *
 * The generated declaration passes `ReturnType<typeof
 * import("./comvi.i18n").default>` as `Instance` and `typeof
 * import("./comvi.setup").default` as `Hook`, so a hook that calls
 * `core.registerLoader(...)` against a factory that never composed the loader
 * fails at build time, by name, instead of at the first call.
 */
export type CheckedNuxtI18nSetup<
  Instance extends WrapperI18nInstance,
  Hook extends NuxtI18nSetup<Instance>,
> = Hook;

/**
 * Context passed to `comvi.setup` hook.
 *
 * `C` is the instance the app runs on, and it defaults to
 * {@link ResolvedNuxtInstance}: the `comvi.i18n` factory's return type when the
 * module's generated declaration is in the program, core's base `I18n` — the
 * no-`i18nModule` configuration — otherwise. An app MAY still name its own
 * instance type (`NuxtI18nSetup<MyInstance>`) and get exactly the capabilities it
 * names; codegen then cross-checks that claim against the factory. Capability
 * calls live on `i18n.core.*` on the plugin side.
 */
export interface NuxtI18nSetupContext<C extends WrapperI18nInstance = ResolvedNuxtInstance> {
  /**
   * i18n instance for current runtime.
   * - VueI18n in Nuxt app plugin — capability APIs live on `i18n.core`
   * - The core instance itself in server utilities (e.g. useTranslation)
   */
  i18n: VueI18n<{}, C> | C;

  /**
   * The instance itself, on both runtimes — `i18n.core` in the app plugin, `i18n`
   * in a server utility.
   *
   * `i18n` above is a UNION, so reaching a capability through it costs a
   * `'core' in i18n` narrowing in every hook. This is the same object, already
   * narrowed.
   */
  core: C;

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
 * The default type parameter is {@link ResolvedNuxtInstance} — inside an app, the
 * `comvi.i18n` factory's own return type, read from the file rather than
 * claimed about it; with no `i18nModule` (and in this package's own
 * compilation) the BASE instance, so capability calls do not compile by accident.
 * Prefer the bare form:
 *
 * @example
 * ```ts
 * // comvi.setup.ts — the instance type comes from comvi.i18n.ts, so composing the
 * // loader there is what makes this call compile here.
 * import type { NuxtI18nSetup } from "@comvi/nuxt";
 *
 * export default (({ core }) => {
 *   core.registerLoader(myLoader);
 * }) satisfies NuxtI18nSetup;
 * ```
 *
 * Naming the instance by hand stays supported, and codegen cross-checks the claim
 * against the factory, so `NuxtI18nSetup<I18n & I18nLoaderApi>` against a
 * factory that composed no loader is a build error rather than a `TypeError`:
 *
 * @example
 * ```ts
 * // The hand-typed fallback — for an instance whose type this package cannot see
 * // (a factory in another package, a `.js` `i18nModule` file).
 * import type { I18n, I18nLoaderApi, NuxtI18nSetup } from "@comvi/nuxt";
 *
 * export default (({ core }) => {
 *   core.registerLoader(myLoader);
 * }) satisfies NuxtI18nSetup<I18n & I18nLoaderApi>;
 * ```
 */
export type NuxtI18nSetup<C extends WrapperI18nInstance = ResolvedNuxtInstance> = (
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

// `I18nLoaderApi` and `LoaderFn` are here so a `comvi.setup` hook typed
// `NuxtI18nSetup<I18n & I18nLoaderApi>` names ONE specifier for all three types:
// `@comvi/core` is a dependency of this package, not of the app, so importing
// them from there needs a dependency the app never declared. Type-only, 0 B.
export type {
  TranslationParams,
  TranslationResult,
  TranslationKeys,
  I18n,
  I18nLoaderApi,
  LoaderFn,
} from "@comvi/core";
