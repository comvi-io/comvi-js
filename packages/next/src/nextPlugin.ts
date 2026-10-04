// The two Next-specific installers: a plugin scoped to one runtime and/or one
// build environment, eager or lazily imported. Scoping lives on the PLUGIN
// form on purpose — a runtime-scoped INSTALLER cannot widen the host type
// soundly, because the capability would exist in one graph only.
//
// Imports nothing but the plugin host, so `/client` and `/server` can carry
// both names without reaching the composed-host builder behind `createNextI18n`.
import { attachPlugins } from "@comvi/core/plugins";
import type { I18n, I18nPlugin, I18nPluginHostApi, PluginOptions } from "@comvi/core";

type PluginRuntimeTarget = "client" | "server";
type PluginEnvironment = "all" | "development" | "production";
type PluginReturn = ReturnType<I18nPlugin>;
type AsyncPluginReturn = Promise<void> | Promise<Exclude<Awaited<PluginReturn>, void>>;

/**
 * Options for {@link nextPlugin} and {@link nextPluginLazy}: the plugin
 * options every host accepts (`required`, `timeout`, `onError`), plus the two
 * Next scopes.
 */
export interface NextPluginOptions extends PluginOptions {
  /**
   * Runtime the plugin runs in. Omit to run it in both.
   *
   * The server is any process without a `window` — Next's `NEXT_RUNTIME`
   * server bundles, and a plain Node process — so a plugin that must never run
   * outside the browser is `runtime: "client"`.
   */
  runtime?: PluginRuntimeTarget;
  /**
   * Build environment the plugin runs in, read from `NODE_ENV`.
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
    "[@comvi/next] Invalid lazy plugin module. " +
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
  (runtime === undefined || shouldRunForRuntime(runtime)) && shouldRunForEnvironment(environment);

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
 * Register a plugin scoped to a Next runtime and/or build environment, as a
 * `.use(…)` installer.
 *
 * ```ts
 * createNextI18n({ ...routing })
 *   .use(nextPlugin(localeDetectorPlugin({ order: ["cookie", "navigator"] }), { runtime: "client" }))
 *   .use(nextPlugin(Metrics(), { environment: "production", required: false }));
 * ```
 *
 * `nextPlugin(fn)` is `attachPlugins(host).registerPlugin(scoped, rest)`
 * wrapped as an installer — `definePlugin(fn)` with the two Next scopes in
 * front of the queue — so it attaches the plugin host if the chain has not
 * already, and sits anywhere in a `.use` chain before `init()`. A plugin
 * scoped out of the current runtime or environment is registered and skipped
 * at `init()`: nothing of it runs, and its own import is still in the graph
 * (see {@link nextPluginLazy} for the deferred import).
 *
 * The module-scope host behind `createNextI18n` is process-wide on the App
 * Router, so a locale detector belongs here — `nextPlugin(localeDetectorPlugin(…),
 * { runtime: "client" })` — and never in `.use(localeDetector(…))`, which
 * would let the first request's headers pin the locale for every later render.
 */
export function nextPlugin(
  plugin: I18nPlugin,
  options: NextPluginOptions = {},
): <T extends I18n<any>>(i18n: T) => T & I18nPluginHostApi {
  const { runtime, environment = "all", ...rest } = options;
  return (i18n) => {
    attachPlugins(i18n).registerPlugin(createScopedPlugin(plugin, runtime, environment), rest);
    return i18n as typeof i18n & I18nPluginHostApi;
  };
}

/**
 * {@link nextPlugin} for a plugin that is imported only when it is due to
 * run: `load` is a dynamic `import()` (or any `() => Promise<plugin | {
 * default: plugin }>`), called at most once per installer, and never in a
 * runtime or environment the scope excludes.
 *
 * ```ts
 * createNextI18n({ ...routing }).use(
 *   nextPluginLazy(
 *     () => import("@comvi/plugin-in-context-editor").then((m) => m.inContextEditorPlugin()),
 *     { runtime: "client", environment: "development", required: false },
 *   ),
 * );
 * ```
 */
export function nextPluginLazy(
  load: LazyPluginLoader,
  options: NextPluginOptions = {},
): <T extends I18n<any>>(i18n: T) => T & I18nPluginHostApi {
  const { runtime, environment = "all", ...rest } = options;
  return (i18n) => {
    attachPlugins(i18n).registerPlugin(createScopedLazyPlugin(load, runtime, environment), rest);
    return i18n as typeof i18n & I18nPluginHostApi;
  };
}
