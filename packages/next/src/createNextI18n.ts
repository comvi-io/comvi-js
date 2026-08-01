import { createI18n } from "@comvi/core";
import type {
  I18nOptions,
  I18n,
  I18nPlugin,
  PluginOptions,
  DefaultTranslationParams,
} from "@comvi/core";
import { defineRouting } from "./routing/defineRouting";
import type { RoutingConfig, LocalePrefixMode } from "./routing/types";

type PluginRuntimeTarget = "client" | "server";
type PluginEnvironment = "all" | "development" | "production";
type PluginReturn = ReturnType<I18nPlugin>;
type AsyncPluginReturn = Promise<void> | Promise<Exclude<Awaited<PluginReturn>, void>>;

export interface ScopedPluginOptions extends PluginOptions {
  /**
   * Environment where plugin should run.
   * @default "all"
   */
  environment?: PluginEnvironment;
}

/**
 * Options for the unified {@link CreateNextI18nResult.use} method.
 */
export interface UsePluginOptions extends ScopedPluginOptions {
  /**
   * Runtime where the plugin should run.
   * Omit to run the plugin in both runtimes.
   */
  runtime?: PluginRuntimeTarget;
  /**
   * When `true`, the first argument is treated as a lazy loader
   * (`() => Promise<plugin | { default: plugin }>`) that is only imported
   * and executed when the plugin is due to run.
   * @default false
   */
  lazy?: boolean;
}

export type LazyPluginModule = I18nPlugin | { default: I18nPlugin };
export type LazyPluginLoader = () => Promise<LazyPluginModule>;

const resolveLazyPlugin = (moduleOrPlugin: LazyPluginModule): I18nPlugin => {
  if (typeof moduleOrPlugin === "function") {
    return moduleOrPlugin;
  }
  if (moduleOrPlugin && typeof moduleOrPlugin.default === "function") {
    return moduleOrPlugin.default;
  }
  throw new Error(
    "[comvi/next] Invalid lazy plugin module. " +
      "Expected a plugin function or { default: pluginFunction }.",
  );
};

const isClientRuntime = (): boolean => {
  // Next.js sets NEXT_RUNTIME in server bundles (nodejs/edge).
  if (process.env.NEXT_RUNTIME) {
    return false;
  }
  return typeof window !== "undefined";
};

const shouldRunForRuntime = (runtime: PluginRuntimeTarget): boolean => {
  const isClient = isClientRuntime();
  return runtime === "client" ? isClient : !isClient;
};

const shouldRunForEnvironment = (environment: PluginEnvironment): boolean => {
  if (environment === "all") {
    return true;
  }
  const isProduction = process.env.NODE_ENV === "production";
  return environment === (isProduction ? "production" : "development");
};

const shouldRunScoped = (
  runtime: PluginRuntimeTarget | undefined,
  environment: PluginEnvironment,
): boolean =>
  (runtime === undefined || shouldRunForRuntime(runtime)) &&
  shouldRunForEnvironment(environment);

const createScopedPlugin = (
  plugin: I18nPlugin,
  runtime: PluginRuntimeTarget | undefined,
  environment: PluginEnvironment,
): I18nPlugin => {
  return (i18n) => {
    if (!shouldRunScoped(runtime, environment)) {
      return;
    }
    return plugin(i18n);
  };
};

const createScopedLazyPlugin = (
  loadPlugin: LazyPluginLoader,
  runtime: PluginRuntimeTarget | undefined,
  environment: PluginEnvironment,
): I18nPlugin => {
  let pluginPromise: Promise<I18nPlugin> | null = null;

  return (i18n) => {
    if (!shouldRunScoped(runtime, environment)) {
      return;
    }
    if (!pluginPromise) {
      pluginPromise = loadPlugin().then(resolveLazyPlugin);
    }
    return pluginPromise.then((plugin) => plugin(i18n)) as AsyncPluginReturn;
  };
};

/**
 * Options for createNextI18n factory
 */
export interface CreateNextI18nBaseOptions {
  // ============================================
  // Routing config (required)
  // ============================================

  /**
   * List of supported locales
   * @example ['en', 'de', 'uk', 'fr']
   */
  locales: string[];

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
   * Localized public pathnames for exact static routes.
   * Keys are canonical internal routes, values are public localized slugs.
   */
  pathnames?: RoutingConfig["pathnames"];

  // ============================================
  // i18n config (optional)
  // ============================================

  /**
   * API key available to plugins/loaders that need authenticated requests.
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
   * Development mode (uses API instead of CDN)
   * @default process.env.NODE_ENV === 'development'
   */
  devMode?: boolean;

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

/**
 * Result of createNextI18n factory
 */
export interface CreateNextI18nResult<D extends DefaultTranslationParams = {}> {
  /**
   * The i18n instance (use with I18nProvider and setI18n)
   */
  i18n: I18n<D>;

  /**
   * Routing configuration (use with middleware and navigation)
   */
  routing: Required<RoutingConfig>;

  /**
   * Register an additional i18n plugin (chainable).
   *
   * The single `use()` method covers every registration mode via options:
   * - `runtime: "client" | "server"` scopes the plugin to one runtime
   *   (omit to run in both).
   * - `lazy: true` treats the first argument as a lazy loader
   *   (`() => Promise<plugin | { default: plugin }>`) that is only imported
   *   when the plugin is due to run.
   * - `environment: "development" | "production"` scopes to a build
   *   environment (default `"all"`).
   *
   * @example
   * ```typescript
   * const nextI18n = createNextI18n({...})
   *   .use(MyPlugin())
   *   .use(MyServerPlugin(), { runtime: "server" })
   *   .use(
   *     () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
   *     { runtime: "client", lazy: true, environment: "development", required: false },
   *   )
   *   .use(AnotherPlugin(), { required: false });
   * ```
   */
  use(
    plugin: I18nPlugin,
    options?: UsePluginOptions & { lazy?: false },
  ): CreateNextI18nResult<D>;
  use(
    loadPlugin: LazyPluginLoader,
    options: UsePluginOptions & { lazy: true },
  ): CreateNextI18nResult<D>;

  /**
   * Register a client-only plugin.
   *
   * @deprecated Use `use(plugin, { runtime: "client" })` instead.
   * Will be removed in 0.6.0.
   */
  useClient(plugin: I18nPlugin, options?: ScopedPluginOptions): CreateNextI18nResult<D>;

  /**
   * Register a server-only plugin.
   *
   * @deprecated Use `use(plugin, { runtime: "server" })` instead.
   * Will be removed in 0.6.0.
   */
  useServer(plugin: I18nPlugin, options?: ScopedPluginOptions): CreateNextI18nResult<D>;

  /**
   * Register a lazily imported client-only plugin.
   *
   * @deprecated Use `use(loadPlugin, { runtime: "client", lazy: true })` instead.
   * Will be removed in 0.6.0.
   */
  useClientLazy(
    loadPlugin: LazyPluginLoader,
    options?: ScopedPluginOptions,
  ): CreateNextI18nResult<D>;

  /**
   * Register a lazily imported server-only plugin.
   *
   * @deprecated Use `use(loadPlugin, { runtime: "server", lazy: true })` instead.
   * Will be removed in 0.6.0.
   */
  useServerLazy(
    loadPlugin: LazyPluginLoader,
    options?: ScopedPluginOptions,
  ): CreateNextI18nResult<D>;
}

/**
 * Create a fully configured Next.js i18n setup with a single function call.
 *
 * This factory creates:
 * - i18n instance
 * - Routing configuration for middleware and navigation
 *
 * @example
 * ```typescript
 * // i18n/config.ts
 * import { createNextI18n } from "@comvi/next";
 *
 * export const { i18n, routing } = createNextI18n({
 *   // Routing
 *   locales: ["en", "de", "uk"],
 *   defaultLocale: "en",
 *
 *   // Optional
 *   basicHtmlTags: ["strong", "em", "br", "a"],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Optional plugin registration (same DX as core/react)
 * import { FetchLoader } from "@comvi/plugin-fetch-loader";
 *
 * const nextI18n = createNextI18n({
 *   locales: ["en", "de"],
 *   defaultLocale: "en",
 * })
 *   .use(
 *     FetchLoader({
 *       cdnUrl: "https://cdn.comvi.io/your-distribution-id",
 *       loadOnInit: false,
 *     }),
 *   )
 *   .use(MyServerPlugin(), { runtime: "server" })
 *   .use(
 *     () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
 *     { runtime: "client", lazy: true, environment: "development", required: false },
 *   )
 *   .use(MyPlugin())
 *   .use(AnotherPlugin(), { required: false });
 *
 * export const { i18n, routing } = nextI18n;
 * ```
 *
 * @example
 * ```typescript
 * // i18n/server.ts - Server entry point
 * import "server-only";
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
    // Routing
    locales,
    defaultLocale,
    localePrefix = "as-needed",
    pathnames,

    apiKey,
    ns,
    translation,
    defaultParams,
    // i18n
    fallbackLocale = defaultLocale,
    defaultNs = "default",
    devMode: devModeOption,
    basicHtmlTags,
    onMissingKey,
  } = options;

  // Determine devMode - use explicit option or detect from NODE_ENV
  // This works in Next.js because bundler replaces process.env.NODE_ENV at build time
  const devMode = devModeOption ?? process.env.NODE_ENV === "development";

  // Create i18n instance
  const i18n = createI18n<D>({
    locale: defaultLocale,
    fallbackLocale,
    defaultNs,
    ns,
    translation,
    defaultParams,
    apiKey,
    devMode,
    onMissingKey,
    tagInterpolation: basicHtmlTags ? { basicHtmlTags } : undefined,
  } as unknown as I18nOptions<D>);

  // Create routing config
  const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix,
    pathnames,
  });

  const result: CreateNextI18nResult<D> = {
    i18n,
    routing,
    use(pluginOrLoader: I18nPlugin | LazyPluginLoader, options?: UsePluginOptions) {
      const { runtime, lazy, environment = "all", ...pluginOptions } = options ?? {};
      if (lazy) {
        i18n.use(
          createScopedLazyPlugin(pluginOrLoader as LazyPluginLoader, runtime, environment),
          pluginOptions,
        );
      } else if (runtime !== undefined || environment !== "all") {
        i18n.use(
          createScopedPlugin(pluginOrLoader as I18nPlugin, runtime, environment),
          pluginOptions,
        );
      } else {
        i18n.use(
          pluginOrLoader as I18nPlugin,
          options === undefined ? undefined : pluginOptions,
        );
      }
      return result;
    },
    useClient(plugin: I18nPlugin, options?: ScopedPluginOptions) {
      return result.use(plugin, { ...options, runtime: "client" });
    },
    useServer(plugin: I18nPlugin, options?: ScopedPluginOptions) {
      return result.use(plugin, { ...options, runtime: "server" });
    },
    useClientLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions) {
      return result.use(loadPlugin, { ...options, runtime: "client", lazy: true });
    },
    useServerLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions) {
      return result.use(loadPlugin, { ...options, runtime: "server", lazy: true });
    },
  };

  return result;
}
