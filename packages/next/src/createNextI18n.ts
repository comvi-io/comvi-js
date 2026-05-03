import { createI18n } from "@comvi/core";
import type { I18nOptions, I18n, I18nPlugin, PluginOptions } from "@comvi/core";
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

const createScopedPlugin = (
  plugin: I18nPlugin,
  runtime: PluginRuntimeTarget,
  environment: PluginEnvironment,
): I18nPlugin => {
  return (i18n) => {
    if (!shouldRunForRuntime(runtime) || !shouldRunForEnvironment(environment)) {
      return;
    }
    return plugin(i18n);
  };
};

const createScopedLazyPlugin = (
  loadPlugin: LazyPluginLoader,
  runtime: PluginRuntimeTarget,
  environment: PluginEnvironment,
): I18nPlugin => {
  let pluginPromise: Promise<I18nPlugin> | null = null;

  return (i18n) => {
    if (!shouldRunForRuntime(runtime) || !shouldRunForEnvironment(environment)) {
      return;
    }
    if (!pluginPromise) {
      pluginPromise = loadPlugin().then(resolveLazyPlugin);
    }
    return pluginPromise.then((plugin) => plugin(i18n)) as AsyncPluginReturn;
  };
};

const normalizeScopedOptions = (options?: ScopedPluginOptions) => {
  const { environment = "all", ...pluginOptions } = options ?? {};
  return { environment, pluginOptions };
};

/**
 * Options for createNextI18n factory
 */
export interface CreateNextI18nOptions {
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

/**
 * Result of createNextI18n factory
 */
export interface CreateNextI18nResult {
  /**
   * The i18n instance (use with I18nProvider and setI18n)
   */
  i18n: I18n;

  /**
   * Routing configuration (use with middleware and navigation)
   */
  routing: Required<RoutingConfig>;

  /**
   * Register an additional i18n plugin (chainable).
   *
   * @example
   * ```typescript
   * const nextI18n = createNextI18n({...})
   *   .use(MyPlugin())
   *   .use(AnotherPlugin(), { required: false });
   * ```
   */
  use(plugin: I18nPlugin, options?: PluginOptions): CreateNextI18nResult;

  /**
   * Register a client-only plugin.
   */
  useClient(plugin: I18nPlugin, options?: ScopedPluginOptions): CreateNextI18nResult;

  /**
   * Register a server-only plugin.
   */
  useServer(plugin: I18nPlugin, options?: ScopedPluginOptions): CreateNextI18nResult;

  /**
   * Register a lazily imported client-only plugin.
   */
  useClientLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions): CreateNextI18nResult;

  /**
   * Register a lazily imported server-only plugin.
   */
  useServerLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions): CreateNextI18nResult;
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
 *   .useServer(MyServerPlugin())
 *   .useClientLazy(
 *     () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
 *     { environment: "development", required: false },
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
export function createNextI18n(options: CreateNextI18nOptions): CreateNextI18nResult {
  const {
    // Routing
    locales,
    defaultLocale,
    localePrefix = "as-needed",
    pathnames,

    apiKey,
    ns,
    translation,
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
  const i18n = createI18n({
    locale: defaultLocale,
    fallbackLocale,
    defaultNs,
    ns,
    translation,
    apiKey,
    devMode,
    onMissingKey,
    tagInterpolation: basicHtmlTags ? { basicHtmlTags } : undefined,
  });

  // Create routing config
  const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix,
    pathnames,
  });

  const result: CreateNextI18nResult = {
    i18n,
    routing,
    use(plugin: I18nPlugin, pluginOptions?: PluginOptions) {
      i18n.use(plugin, pluginOptions);
      return result;
    },
    useClient(plugin: I18nPlugin, options?: ScopedPluginOptions) {
      const { environment, pluginOptions } = normalizeScopedOptions(options);
      i18n.use(createScopedPlugin(plugin, "client", environment), pluginOptions);
      return result;
    },
    useServer(plugin: I18nPlugin, options?: ScopedPluginOptions) {
      const { environment, pluginOptions } = normalizeScopedOptions(options);
      i18n.use(createScopedPlugin(plugin, "server", environment), pluginOptions);
      return result;
    },
    useClientLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions) {
      const { environment, pluginOptions } = normalizeScopedOptions(options);
      i18n.use(createScopedLazyPlugin(loadPlugin, "client", environment), pluginOptions);
      return result;
    },
    useServerLazy(loadPlugin: LazyPluginLoader, options?: ScopedPluginOptions) {
      const { environment, pluginOptions } = normalizeScopedOptions(options);
      i18n.use(createScopedLazyPlugin(loadPlugin, "server", environment), pluginOptions);
      return result;
    },
  };

  return result;
}
