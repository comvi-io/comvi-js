import { createComposedNextI18n, type NextComposedI18n } from "./composedHost";
import type { I18nOptions, DefaultTranslationParams, MessageCompiler } from "@comvi/core";
import { resolveRouting } from "./nextI18nRouting";
import type { NextRoutingOptions } from "./nextI18nRouting";
import type { RoutingConfig } from "./routing/types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** Thrown by {@link CreateNextI18nResult.use} when an installer hands back a different object. */
export interface UseHostIdentityError extends Error {
  code: "E_USE_HOST_IDENTITY";
}

export interface CreateNextI18nBaseOptions extends NextRoutingOptions {
  /**
   * Credential forwarded to the host as `i18n.apiKey`, for a loader plugin
   * that authenticates against a backend (`@comvi/plugin-fetch-loader` reads
   * it there). This factory loads NOTHING on its own — it neither contacts a
   * CDN nor an API — so the key is inert until you compose `fetchLoader` or
   * `cdnLoader`.
   */
  apiKey?: string;

  /**
   * Namespaces to load during init.
   * If omitted, only default namespace is loaded.
   */
  ns?: I18nOptions["ns"];

  /**
   * Static translations to seed i18n cache (no loader required).
   */
  translation?: I18nOptions["translation"];

  /**
   * Fallback locale when translation is missing
   * @default same as defaultLocale
   */
  fallbackLocale?: string | string[];

  /**
   * Default namespace for translations
   * @default 'default'
   */
  defaultNs?: string;

  /**
   * Forwarded to the host as `i18n.devMode`, where a fetch-loader plugin reads
   * it to pick the API over the CDN. This factory loads nothing on its own, so
   * the flag changes nothing until `fetchLoader` or `cdnLoader` is composed.
   * @default process.env.NODE_ENV === 'development'
   */
  devMode?: boolean;

  /**
   * Message compiler for the host. Omitted, the host uses core's default
   * `{param}` compiler, which does NOT render `plural`, `select` or
   * `selectordinal`: development throws `E_ICU_SYNTAX` at ingestion, and
   * production renders the braced message literally and reports it once (to
   * the console here — this factory forwards no `onError`). Pass
   * `compiler: icuCompiler` from `@comvi/core/icu` to compile
   * ICU in every catalog the host ingests, whatever its source — the same rule
   * as `createI18n` on `/client` and `/server`, and as every other
   * constructor in the repo. ICU is never enabled automatically.
   */
  compiler?: MessageCompiler;

  /**
   * HTML tags allowed in translations (for tag interpolation)
   * @example ['strong', 'em', 'br', 'a']
   */
  basicHtmlTags?: string[];

  /**
   * Callback for missing translation keys
   */
  onMissingKey?: I18nOptions["onMissingKey"];
}

export type CreateNextI18nOptions<D extends DefaultTranslationParams = {}> =
  CreateNextI18nBaseOptions & Pick<I18nOptions<D>, "defaultParams">;

export interface CreateNextI18nResult<
  D extends DefaultTranslationParams = {},
  C extends NextComposedI18n<D> = NextComposedI18n<D>,
> {
  /**
   * The i18n instance (use with I18nProvider and setI18n).
   */
  readonly i18n: C;

  /**
   * Routing configuration (use with middleware and navigation)
   */
  readonly routing: Required<RoutingConfig>;

  /**
   * Compose a capability onto the host and keep this result: `use(f)` is
   * `f(this.i18n)`, and the return value is this same result retyped so
   * `i18n` carries whatever the installer widened the host to. The one
   * composition verb, with the same contract as core's `i18n.use(…)`.
   *
   * ```ts
   * export const { i18n, routing } = createNextI18n({ ...routing, fallbackLocale: "en" })
   *   .use(loader({ en: () => import("./locales/en.json") }))
   *   .use(nextPlugin(localeDetectorPlugin({ order: ["cookie"] }), { runtime: "client" }));
   * ```
   *
   * A plugin scoped to one runtime or build environment goes through
   * {@link nextPlugin} / {@link nextPluginLazy}; an unscoped one through
   * `definePlugin(fn)`; a plugin package through its bare-name installer. ICU
   * is not composed at all and is never on by default: it is the `compiler`
   * option, `compiler: icuCompiler`.
   *
   * Never compose `localeDetector()` on this host. It lives at module scope
   * and is process-wide on the App Router, so the detector would run once, at
   * the host's `init()`, and the first request's headers would pin the locale
   * for every later render. Use
   * `nextPlugin(localeDetectorPlugin(…), { runtime: "client" })` instead: the
   * browser has exactly one visitor.
   *
   * Installers widen the host IN PLACE and return it, and everything else in
   * this result — `setI18n(i18n)`, the provider, the server helpers — holds
   * that one host, so an installer that hands back a different object is
   * refused with `code: "E_USE_HOST_IDENTITY"`, reported over `this.i18n`
   * (the composed host), instead of leaving the app driving a host nothing
   * else sees. A raw ASYNC plugin handed here has already run by the time the
   * check fires, so its rejection is swallowed and the identity error is the
   * only thing the app sees; the development message names the ways out,
   * exactly as core's does.
   */
  use<T extends C>(installer: (i18n: C) => T): CreateNextI18nResult<D, T>;
}

/**
 * Create a fully configured Next.js i18n setup with a single function call.
 *
 * @example
 * ```typescript
 * // i18n/config.ts
 * import { createNextI18n, loader } from "@comvi/next";
 *
 * export const { i18n, routing } = createNextI18n({
 *   // Routing
 *   locales: ["en", "de", "uk"],
 *   defaultLocale: "en",
 *
 *   // Optional
 *   basicHtmlTags: ["strong", "em", "br", "a"],
 * }).use(loader({ en: () => import("./locales/en.json") }));
 * ```
 *
 * @example
 * ```typescript
 * // i18n/server.ts - Server entry point
 * import { setI18n } from "@comvi/next/server";
 * import { i18n } from "./config";
 *
 * setI18n(i18n);
 *
 * export { i18n, routing } from "./config";
 * export { getI18n, loadTranslations } from "@comvi/next/server";
 * ```
 */
export function createNextI18n<const D extends DefaultTranslationParams = {}>(
  options: CreateNextI18nOptions<D>,
): CreateNextI18nResult<D> {
  const {
    defaultLocale,
    apiKey,
    ns,
    translation,
    defaultParams,
    fallbackLocale = defaultLocale,
    defaultNs = "default",
    devMode: devModeOption,
    compiler,
    basicHtmlTags,
    onMissingKey,
  } = options;

  // Statically analysable in Next.js: the bundler replaces process.env.NODE_ENV at build time.
  const devMode = devModeOption ?? process.env.NODE_ENV === "development";

  // Built through Next's own composed-host builder so the published `i18n` is a
  // `NextComposedI18n`, never core's base root instance.
  const i18n = createComposedNextI18n<D>({
    locale: defaultLocale,
    fallbackLocale,
    defaultNs,
    ns,
    translation,
    defaultParams,
    apiKey,
    devMode,
    compiler,
    onMissingKey,
    tagInterpolation: basicHtmlTags ? { basicHtmlTags } : undefined,
  } as unknown as I18nOptions<D>);

  const routing = resolveRouting(options);

  const result: CreateNextI18nResult<D> = {
    i18n,
    routing,
    use<T extends NextComposedI18n<D>>(installer: (i18n: NextComposedI18n<D>) => T) {
      const widened: unknown = installer(i18n);
      if (widened !== i18n) {
        // Same three lines core's `use` has, for the same reason: the function
        // already RAN, so a raw ASYNC plugin has a live promise here. The error
        // below is the report; that promise's rejection is not, and leaving it
        // floating would print an unhandled rejection on top of an already-clear
        // diagnostic. Swallow it, and only it.
        if (typeof (widened as { then?: unknown } | null | undefined)?.then === "function") {
          void (widened as Promise<unknown>).then(undefined, () => {});
        }
        const error = new Error(
          IS_DEV
            ? "[i18n] .use(installer) must return the host it was given. A raw plugin goes through .use(definePlugin(f)) or .use(nextPlugin(f, { runtime })); a plugin package's installer is the name WITHOUT the Plugin suffix (localeDetector(), not localeDetectorPlugin())."
            : "E_USE_HOST_IDENTITY",
        ) as UseHostIdentityError;
        error.code = "E_USE_HOST_IDENTITY";
        throw error;
      }
      return result as unknown as CreateNextI18nResult<D, T>;
    },
  };

  return result;
}
